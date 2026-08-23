import type { CoachPersona } from '@chess-coach/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoachMessage } from './useCoachChat.js';
import { getSpeakableText } from '../tts/getSpeakableText.js';
import { PERSONA_VOICES } from '../tts/persona-voices.js';
import { getSharedTtsWorker } from '../tts/shared-tts-worker-instance.js';

const AUTOPLAY_STORAGE_KEY = 'chess-coach:coach-voice-autoplay';

function readStoredAutoplay(): boolean {
  try {
    return window.localStorage.getItem(AUTOPLAY_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredAutoplay(enabled: boolean): void {
  try {
    window.localStorage.setItem(AUTOPLAY_STORAGE_KEY, String(enabled));
  } catch {
    // Safari private mode / storage disabled — the toggle still works for
    // the rest of the session, it just won't persist across reloads.
  }
}

interface QueueEntry {
  messageId: string;
  text: string;
}

/** One message's streamed audio: object URLs for each sentence chunk
 * received so far (in order), plus whether the stream is still in flight. */
interface MessageAudioState {
  urls: string[];
  complete: boolean;
  errored: boolean;
}

export interface UseCoachVoiceOptions {
  messages: CoachMessage[];
  isStreaming: boolean;
  persona: CoachPersona;
}

export interface UseCoachVoiceResult {
  autoplayEnabled: boolean;
  setAutoplayEnabled: (enabled: boolean) => void;
  /** Play (or replay) one message's audio, always restarting from 0.
   * Interrupts anything currently playing/queued — a click always wins. */
  play: (messageId: string, text: string) => void;
  stop: () => void;
  playingMessageId: string | null;
  loadingMessageId: string | null;
}

/** Reads each finished coach turn aloud with Kokoro TTS, voiced per the
 * active persona (persona-voices.ts), and lets any message be replayed on
 * demand. Kokoro synthesizes sentence-by-sentence (kokoro-worker.ts's
 * stream() call) rather than all at once — playback starts on the first
 * chunk instead of waiting for the whole (often multi-sentence) reply to
 * finish generating, then plays each later chunk as it arrives. Every
 * chunk is cached per message id, so replaying never re-runs inference.
 *
 * Autoplay fires once per newly-finished turn: the `isStreaming` true→false
 * edge (useCoachChat resolves nested client-tool-result round-trips before
 * that flip, so it's genuinely "turn done", not "one chunk done"). Message
 * ids seen before the *first* edge — i.e. everything from session history —
 * are marked handled without queuing audio, so reopening an in-progress
 * session doesn't autoplay its whole transcript. */
export function useCoachVoice({ messages, isStreaming, persona }: UseCoachVoiceOptions): UseCoachVoiceResult {
  const [autoplayEnabled, setAutoplayEnabledState] = useState(readStoredAutoplay);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [loadingMessageId, setLoadingMessageId] = useState<string | null>(null);

  const personaRef = useRef(persona);
  useEffect(() => {
    personaRef.current = persona;
  }, [persona]);

  const cacheRef = useRef(new Map<string, MessageAudioState>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<QueueEntry[]>([]);
  const activeRef = useRef(false);
  // Which message the shared <audio> element is currently working through,
  // and its audio state — captured once per playNow() call and read by name
  // (not re-fetched from cacheRef) for the rest of that message's playback,
  // so a later play() on a different message can never cross wires with it.
  const currentMessageIdRef = useRef<string | null>(null);
  const currentStateRef = useRef<MessageAudioState | null>(null);
  // Index of the next not-yet-played chunk for currentMessageIdRef — reset
  // to 0 at the start of every playNow(), including a replay, so a message
  // already fully cached still plays chunk 0 first rather than resuming
  // wherever a previous playthrough left off.
  const nextChunkIndexRef = useRef(0);
  // True once playback has caught up to every chunk received so far but the
  // stream isn't finished yet — onChunkArrived/onStreamSettled resume from
  // here as more audio lands.
  const waitingForChunkRef = useRef(false);
  const wasStreamingRef = useRef(isStreaming);
  const handledIdsRef = useRef(new Set<string>());

  function getAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.addEventListener('ended', () => {
        const messageId = currentMessageIdRef.current;
        const state = currentStateRef.current;
        if (messageId && state) playNextChunk(messageId, state);
      });
      audioRef.current = audio;
    }
    return audioRef.current;
  }

  function finishMessage(): void {
    waitingForChunkRef.current = false;
    activeRef.current = false;
    currentMessageIdRef.current = null;
    currentStateRef.current = null;
    setPlayingMessageId(null);
    advanceQueue();
  }

  function playNextChunk(messageId: string, state: MessageAudioState): void {
    const index = nextChunkIndexRef.current;
    if (index < state.urls.length) {
      waitingForChunkRef.current = false;
      const audio = getAudio();
      audio.src = state.urls[index] ?? '';
      audio.currentTime = 0;
      nextChunkIndexRef.current = index + 1;
      setPlayingMessageId(messageId);
      Promise.resolve(audio.play()).catch(() => finishMessage());
      return;
    }
    if (state.complete || state.errored) {
      finishMessage();
      return;
    }
    // Caught up to what's arrived so far, but more is still generating —
    // onChunkArrived/onStreamSettled resume playback from here.
    waitingForChunkRef.current = true;
  }

  function onChunkArrived(messageId: string): void {
    if (currentMessageIdRef.current !== messageId || !waitingForChunkRef.current) return;
    const state = currentStateRef.current;
    if (state) playNextChunk(messageId, state);
  }

  function onStreamSettled(messageId: string): void {
    if (currentMessageIdRef.current !== messageId || !waitingForChunkRef.current) return;
    const state = currentStateRef.current;
    if (state) playNextChunk(messageId, state);
  }

  function ensureStream(messageId: string, text: string): MessageAudioState {
    const cached = cacheRef.current.get(messageId);
    if (cached && !cached.errored) return cached;

    const state: MessageAudioState = { urls: [], complete: false, errored: false };
    cacheRef.current.set(messageId, state);
    setLoadingMessageId(messageId);

    const promise = getSharedTtsWorker()
      .speak({ text, voice: PERSONA_VOICES[personaRef.current] }, (_index, audio) => {
        const isFirstChunk = state.urls.length === 0;
        state.urls.push(URL.createObjectURL(new Blob([audio], { type: 'audio/wav' })));
        // "Loading" means "nothing audible yet" — once the first chunk
        // lands there's real sound to play, even while later sentences are
        // still generating in the background.
        if (isFirstChunk) setLoadingMessageId((current) => (current === messageId ? null : current));
        onChunkArrived(messageId);
      })
      .then(() => {
        state.complete = true;
        onStreamSettled(messageId);
      })
      .catch((error: unknown) => {
        state.errored = true;
        setLoadingMessageId((current) => (current === messageId ? null : current));
        onStreamSettled(messageId);
        throw error;
      });
    // Failures are observed via state.errored (checked in playNextChunk);
    // this just prevents an unhandled-rejection console warning.
    promise.catch(() => {});
    return state;
  }

  function playNow(messageId: string, text: string): void {
    activeRef.current = true;
    currentMessageIdRef.current = messageId;
    nextChunkIndexRef.current = 0;
    waitingForChunkRef.current = false;
    const state = ensureStream(messageId, text);
    currentStateRef.current = state;
    playNextChunk(messageId, state);
  }

  function advanceQueue(): void {
    if (activeRef.current) return;
    const next = queueRef.current.shift();
    if (next) playNow(next.messageId, next.text);
  }

  const play = useCallback((messageId: string, text: string) => {
    queueRef.current = [];
    audioRef.current?.pause();
    activeRef.current = false;
    waitingForChunkRef.current = false;
    currentMessageIdRef.current = null;
    currentStateRef.current = null;
    playNow(messageId, text);
  }, []);

  const stop = useCallback(() => {
    queueRef.current = [];
    audioRef.current?.pause();
    activeRef.current = false;
    waitingForChunkRef.current = false;
    currentMessageIdRef.current = null;
    currentStateRef.current = null;
    setPlayingMessageId(null);
  }, []);

  const setAutoplayEnabled = useCallback((enabled: boolean) => {
    setAutoplayEnabledState(enabled);
    writeStoredAutoplay(enabled);
  }, []);

  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;
    // Mid-turn: leave newly-appended message ids out of `handled` so the
    // turn-finished branch below can find them once the turn settles.
    if (isStreaming) return;

    const handled = handledIdsRef.current;
    const newMessages = messages.filter((message) => !handled.has(message.id));
    for (const message of newMessages) handled.add(message.id);

    if (!wasStreaming || !autoplayEnabled) return;
    for (const message of newMessages) {
      const text = getSpeakableText(message);
      if (text) queueRef.current.push({ messageId: message.id, text });
    }
    advanceQueue();
    // advanceQueue/playNow/ensureStream/getAudio are intentionally left out
    // of the dep list: they close only over refs and stable setters, so
    // every render's version is behaviorally identical — listing them would
    // just re-run this effect on every render for no reason.
  }, [isStreaming, messages, autoplayEnabled]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      for (const state of cacheRef.current.values()) {
        for (const url of state.urls) URL.revokeObjectURL(url);
      }
    };
  }, []);

  return { autoplayEnabled, setAutoplayEnabled, play, stop, playingMessageId, loadingMessageId };
}

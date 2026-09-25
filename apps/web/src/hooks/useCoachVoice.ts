import type { CoachPersona, TtsBackend } from '@freechesscoach/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoachMessage } from './useCoachChat.js';
import { getSpeakableSentences, isSpeakableProse } from '../tts/getSpeakableText.js';
import { startMessageAudio, type MessageAudio, type MessageAudioState } from '../tts/message-audio.js';
import { createNativeSpeechQueue, speakNative, type NativeSpeechQueue } from '../tts/native-speech.js';
import { applyPlaybackRate, personaPlaybackRate } from '../tts/persona-voices.js';
import { resolveTtsClient } from '../tts/resolve-tts-client.js';

const AUTOPLAY_STORAGE_KEY = 'freechesscoach:coach-voice-autoplay';

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

/** A coach message being read aloud while it is still streaming in: the
 * spoken sentences handed to voice so far, and where they went — `audio`
 * for the blob backends (synthesis starts the moment a sentence completes,
 * even while an earlier message is still playing), `native` once the
 * device voice has reached this message in the queue. */
interface LiveMessage {
  sentences: string[];
  final: boolean;
  audio: MessageAudio | null;
  native: NativeSpeechQueue | null;
}

export interface UseCoachVoiceOptions {
  messages: CoachMessage[];
  isStreaming: boolean;
  persona: CoachPersona;
  /** users.tts_enabled — the Settings master switch, off by default. Play
   * and autoplay both no-op while this is false, so a stale autoplay
   * preference or in-flight queue from before the user turned voice off
   * can't still trigger playback (or, on the OpenAI backend, bill usage to
   * the user's own OpenAI key via a route the server would reject anyway). */
  enabled: boolean;
  /** users.tts_backend — which client (openai-tts-client.ts vs.
   * kokoro-tts-client.ts) actually synthesizes the audio. */
  backend: TtsBackend;
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

/** Reads each coach reply aloud as it streams in, voiced per the active
 * persona, and lets any message be replayed on demand. `enabled`/`backend`
 * mirror the Settings-page coach-voice toggle (users.tts_enabled/
 * tts_backend).
 *
 * Autoplay speaks sentence by sentence while the turn is still generating:
 * each sentence goes to voice as soon as the next one starts
 * (getSpeakableSentences), so the first sentence is playing while the model
 * is still writing the rest, and later sentences synthesize ahead of
 * playback. A message is final once the turn ends (`isStreaming` goes
 * false — useCoachChat resolves nested client-tool round-trips before that
 * flip) or a later coach message has started, and only then is its last
 * sentence spoken. Every chunk is cached per message id, so replaying never
 * re-synthesizes. Message ids seen while nothing is streaming — session
 * history — are marked handled without queuing audio, so reopening a
 * session doesn't autoplay its whole transcript. */
export function useCoachVoice({
  messages,
  isStreaming,
  persona,
  enabled,
  backend
}: UseCoachVoiceOptions): UseCoachVoiceResult {
  const [autoplayEnabled, setAutoplayEnabledState] = useState(readStoredAutoplay);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [loadingMessageId, setLoadingMessageId] = useState<string | null>(null);

  const personaRef = useRef(persona);
  useEffect(() => {
    personaRef.current = persona;
  }, [persona]);

  const backendRef = useRef(backend);
  useEffect(() => {
    backendRef.current = backend;
  }, [backend]);

  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const cacheRef = useRef(new Map<string, MessageAudioState>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<string[]>([]);
  const liveRef = useRef(new Map<string, LiveMessage>());
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
  // Cancels the in-flight native (speechSynthesis) read, if any. Native
  // playback bypasses the chunk/<audio> machinery above entirely.
  const cancelNativeRef = useRef<(() => void) | null>(null);

  function cancelNative(): void {
    cancelNativeRef.current?.();
    cancelNativeRef.current = null;
  }

  function getAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.addEventListener('ended', () => {
        console.log(`[useCoachVoice] chunk ended for ${currentMessageIdRef.current}`);
        const messageId = currentMessageIdRef.current;
        const state = currentStateRef.current;
        if (messageId && state) playNextChunk(messageId, state);
      });
      // A chunk's WAV blob failing to decode/play (corrupt data, unsupported
      // format) used to leave playback stuck forever — 'ended' never fires,
      // so nothing would ever call finishMessage(). Now it's treated the
      // same as a stream error: stop cleanly rather than hang.
      audio.addEventListener('error', () => {
        console.log(`[useCoachVoice] audio error for ${currentMessageIdRef.current}`, audio.error);
        finishMessage();
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
      applyPlaybackRate(audio, state.playbackRate);
      audio.currentTime = 0;
      nextChunkIndexRef.current = index + 1;
      setPlayingMessageId(messageId);
      console.log(`[useCoachVoice] playing chunk ${index} for ${messageId}`);
      Promise.resolve(audio.play()).catch((error: unknown) => {
        console.log(`[useCoachVoice] audio.play() rejected for ${messageId} chunk ${index}`, error);
        finishMessage();
      });
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

  function startAudio(messageId: string): MessageAudio {
    const backend = backendRef.current;
    if (backend === 'native') throw new Error('native voice does not stream audio chunks');
    setLoadingMessageId(messageId);
    const audio = startMessageAudio({
      client: resolveTtsClient(backend),
      persona: personaRef.current,
      playbackRate: personaPlaybackRate(personaRef.current, backend),
      onChunk: (state) => {
        // "Loading" means "nothing audible yet" — once the first chunk
        // lands there's real sound to play, even while later sentences are
        // still generating in the background.
        if (state.urls.length === 1) setLoadingMessageId((current) => (current === messageId ? null : current));
        onChunkArrived(messageId);
      },
      onSettled: (state) => {
        if (state.errored) setLoadingMessageId((current) => (current === messageId ? null : current));
        onStreamSettled(messageId);
      }
    });
    cacheRef.current.set(messageId, audio.state);
    return audio;
  }

  function ensureStream(messageId: string, text: string): MessageAudioState {
    const cached = cacheRef.current.get(messageId);
    if (cached && !cached.errored) return cached;
    const audio = startAudio(messageId);
    audio.append(text);
    audio.finish();
    return audio.state;
  }

  function playNative(messageId: string, text: string): void {
    setPlayingMessageId(messageId);
    cancelNativeRef.current = speakNative(text, personaRef.current, finishMessage);
  }

  function playNativeLive(messageId: string, live: LiveMessage): void {
    setPlayingMessageId(messageId);
    const native = createNativeSpeechQueue(personaRef.current, finishMessage);
    for (const sentence of live.sentences) native.append(sentence);
    if (live.final) native.finish();
    live.native = native;
    cancelNativeRef.current = native.cancel;
  }

  function playNow(messageId: string, text: string): void {
    activeRef.current = true;
    currentMessageIdRef.current = messageId;
    const live = liveRef.current.get(messageId);
    if (backendRef.current === 'native') {
      if (live) playNativeLive(messageId, live);
      else playNative(messageId, text);
      return;
    }
    nextChunkIndexRef.current = 0;
    waitingForChunkRef.current = false;
    // Queued by autoplay (no text of its own): the live audio, as far as it
    // got. A click on the play button passes the text, so an errored read
    // is re-synthesized instead.
    const state = text === '' && live?.audio ? live.audio.state : ensureStream(messageId, text);
    currentStateRef.current = state;
    playNextChunk(messageId, state);
  }

  function advanceQueue(): void {
    if (activeRef.current) return;
    const next = queueRef.current.shift();
    if (next) playNow(next, '');
  }

  /** Hands a streaming message's newly completed sentences to voice,
   * starting it (and queuing it for playback) on its first sentence. */
  function feedLiveMessage(messageId: string, sentences: string[], isFinal: boolean): void {
    let live = liveRef.current.get(messageId);
    if (!live) {
      if (sentences.length === 0) return;
      const audio = backendRef.current === 'native' ? null : startAudio(messageId);
      live = { sentences: [], final: false, audio, native: null };
      liveRef.current.set(messageId, live);
      queueRef.current.push(messageId);
    }
    for (const sentence of sentences.slice(live.sentences.length)) {
      live.sentences.push(sentence);
      live.audio?.append(sentence);
      live.native?.append(sentence);
    }
    if (isFinal && !live.final) {
      live.final = true;
      live.audio?.finish();
      live.native?.finish();
    }
    advanceQueue();
  }

  const play = useCallback((messageId: string, text: string) => {
    if (!enabledRef.current) return;
    queueRef.current = [];
    audioRef.current?.pause();
    cancelNative();
    activeRef.current = false;
    waitingForChunkRef.current = false;
    currentMessageIdRef.current = null;
    currentStateRef.current = null;
    playNow(messageId, text);
  }, []);

  const stop = useCallback(() => {
    queueRef.current = [];
    audioRef.current?.pause();
    cancelNative();
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
    const handled = handledIdsRef.current;
    const turnActive = isStreaming || wasStreaming;
    if (!turnActive || !autoplayEnabled || !enabled) {
      // Mid-turn with voice off: leave newly-appended ids unhandled so
      // turning autoplay on before the turn ends still reads them.
      if (!isStreaming) for (const message of messages) handled.add(message.id);
      return;
    }
    for (const [index, message] of messages.entries()) {
      if (handled.has(message.id)) continue;
      const isFinal = !isStreaming || hasLaterCoachText(messages, index);
      feedLiveMessage(message.id, getSpeakableSentences(message, isFinal), isFinal);
      if (isFinal) handled.add(message.id);
    }
    // feedLiveMessage/advanceQueue/playNow/startAudio/getAudio are
    // intentionally left out of the dep list: they close only over refs and
    // stable setters, so every render's version is behaviorally identical —
    // listing them would just re-run this effect on every render for no
    // reason.
  }, [isStreaming, messages, autoplayEnabled, enabled]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      cancelNativeRef.current?.();
      for (const live of liveRef.current.values()) live.native?.cancel();
      for (const state of cacheRef.current.values()) {
        for (const url of state.urls) URL.revokeObjectURL(url);
      }
    };
  }, []);

  return {
    autoplayEnabled,
    setAutoplayEnabled,
    play,
    stop,
    playingMessageId,
    loadingMessageId
  };
}

/** A later coach reply has started streaming prose, so the one at `index` is
 * done even though the turn as a whole is still going. Structured messages
 * (a board move, a position divider) don't count: they can land while the
 * reply before them is still being written. */
function hasLaterCoachText(messages: CoachMessage[], index: number): boolean {
  return messages.slice(index + 1).some(isSpeakableProse);
}

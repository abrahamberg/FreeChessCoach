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
 * demand. Synthesized audio is cached per message id — replaying never
 * re-runs inference.
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

  const cacheRef = useRef(new Map<string, Promise<string>>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<QueueEntry[]>([]);
  const activeRef = useRef(false);
  const wasStreamingRef = useRef(isStreaming);
  const handledIdsRef = useRef(new Set<string>());

  function getAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.addEventListener('ended', () => {
        activeRef.current = false;
        setPlayingMessageId(null);
        advanceQueue();
      });
      audioRef.current = audio;
    }
    return audioRef.current;
  }

  function synthesize(messageId: string, text: string): Promise<string> {
    const cached = cacheRef.current.get(messageId);
    if (cached) return cached;

    setLoadingMessageId(messageId);
    const promise = getSharedTtsWorker()
      .speak({ text, voice: PERSONA_VOICES[personaRef.current] })
      .then((audio) => URL.createObjectURL(new Blob([audio], { type: 'audio/wav' })))
      .finally(() => setLoadingMessageId((current) => (current === messageId ? null : current)));
    cacheRef.current.set(messageId, promise);
    // A failed synthesis shouldn't stay cached as a rejected promise forever
    // — the next play() attempt should retry instead of replaying the
    // failure.
    promise.catch(() => cacheRef.current.delete(messageId));
    return promise;
  }

  function playNow(messageId: string, text: string): void {
    activeRef.current = true;
    setPlayingMessageId(messageId);
    const audio = getAudio();
    synthesize(messageId, text)
      .then((url) => {
        audio.src = url;
        audio.currentTime = 0;
        return Promise.resolve(audio.play());
      })
      .catch(() => {
        // Synthesis failure, or the browser blocked autoplay without a user
        // gesture — either way, nothing more to do than fall back to idle.
        activeRef.current = false;
        setPlayingMessageId((current) => (current === messageId ? null : current));
        advanceQueue();
      });
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
    playNow(messageId, text);
  }, []);

  const stop = useCallback(() => {
    queueRef.current = [];
    audioRef.current?.pause();
    activeRef.current = false;
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
    // advanceQueue/playNow/synthesize/getAudio are intentionally left out of
    // the dep list: they close only over refs and stable setters, so every
    // render's version is behaviorally identical — listing them would just
    // re-run this effect on every render for no reason.
  }, [isStreaming, messages, autoplayEnabled]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  return { autoplayEnabled, setAutoplayEnabled, play, stop, playingMessageId, loadingMessageId };
}

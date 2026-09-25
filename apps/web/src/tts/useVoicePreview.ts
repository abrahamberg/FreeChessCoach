import type { CoachPersona, TtsBackend } from '@freechesscoach/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { speakNative } from './native-speech.js';
import { applyPlaybackRate, personaPlaybackRate } from './persona-voices.js';
import { resolveTtsClient } from './resolve-tts-client.js';

export interface VoicePreviewRequest {
  persona: CoachPersona;
  backend: TtsBackend;
  text: string;
}

export interface UseVoicePreviewResult {
  /** Which sample (by caller-chosen key) is synthesizing or playing. */
  loadingKey: string | null;
  playingKey: string | null;
  failedKey: string | null;
  /** Starts a sample, interrupting any other; the same key again stops it. */
  toggle: (key: string, request: VoicePreviewRequest) => void;
}

/** Plays one short sample through any voice backend, for the Settings
 * "hear it" buttons. Unlike useCoachVoice there's no message cache or
 * autoplay queue: a sample is synthesized fresh every click, chunks play in
 * order as they arrive, and a new click always wins. Works whether or not
 * coach voice is switched on — hearing the options is how you choose. */
export function useVoicePreview(): UseVoicePreviewResult {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  const cancelRef = useRef<() => void>(() => {});

  const stop = useCallback(() => {
    cancelRef.current();
    cancelRef.current = () => {};
    activeKeyRef.current = null;
    setLoadingKey(null);
    setPlayingKey(null);
  }, []);

  useEffect(() => stop, [stop]);

  const toggle = useCallback(
    (key: string, { persona, backend, text }: VoicePreviewRequest) => {
      const wasActive = activeKeyRef.current === key;
      stop();
      setFailedKey(null);
      if (wasActive) return;
      activeKeyRef.current = key;
      const isCurrent = (): boolean => activeKeyRef.current === key;
      const finish = (failed: boolean): void => {
        if (!isCurrent()) return;
        stop();
        if (failed) setFailedKey(key);
      };

      if (backend === 'native') {
        setPlayingKey(key);
        cancelRef.current = speakNative(text, persona, () => finish(false));
        return;
      }

      setLoadingKey(key);
      const client = resolveTtsClient(backend);
      const audio = new Audio();
      const urls: string[] = [];
      let next = 0;
      let done = false;
      let idle = true;

      function playNext(): void {
        if (!isCurrent()) return;
        if (next < urls.length) {
          idle = false;
          audio.src = urls[next++] as string;
          applyPlaybackRate(audio, personaPlaybackRate(persona, backend));
          audio.play().catch(() => finish(true));
        } else if (done) {
          finish(false);
        } else {
          idle = true;
        }
      }

      audio.onended = playNext;
      audio.onerror = () => finish(true);
      cancelRef.current = () => {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        for (const url of urls) URL.revokeObjectURL(url);
      };

      client
        .speak({ text, persona, preview: true }, (_index, bytes) => {
          if (!isCurrent()) return;
          urls.push(URL.createObjectURL(new Blob([bytes], { type: client.mimeType })));
          setLoadingKey(null);
          setPlayingKey(key);
          if (idle) playNext();
        })
        .then(() => {
          done = true;
          if (idle) playNext();
        })
        .catch(() => finish(true));
    },
    [stop]
  );

  return { loadingKey, playingKey, failedKey, toggle };
}

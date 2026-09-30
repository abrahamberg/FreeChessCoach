import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { setVoiceSpeaking } from '../../../sounds/voice-activity.js';

/** Where a note's audio comes from: the uploaded file on the public page, the
 * browser's voice cache in the editor's preview. Null when the note has none. */
export type NoteAudioSource = (episodeId: string, nodeId: string) => Promise<string | null>;

/** One note plays at a time; stepping on stops the last one. Sound can be
 * switched off. Playback starts from the learner's own click, so browsers
 * allow it. */
export function useNoteAudio(source: NoteAudioSource): {
  /** `delayMs`: wait before speaking (the move's board sound first). */
  play: (episodeId: string, nodeId: string, delayMs?: number) => void;
  stop: () => void;
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
  loading: boolean;
  /** Why the last note could not be voiced (e.g. the preview's voice failed). */
  error: string | null;
} {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef(0);
  const [soundOn, setSound] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef(0);
  const voiceId = useId();

  const stop = useCallback(() => {
    requestRef.current += 1;
    window.clearTimeout(timerRef.current);
    audioRef.current?.pause();
    setLoading(false);
    setError(null);
  }, []);

  const play = useCallback(
    (episodeId: string, nodeId: string, delayMs = 0) => {
      stop();
      if (!soundOn) return;
      const request = requestRef.current;
      setLoading(true);
      source(episodeId, nodeId)
        .then((url) => {
          if (request !== requestRef.current) return;
          setLoading(false);
          if (!url) return;
          if (!audioRef.current) {
            const audio = new Audio();
            // Board sounds step aside while a note speaks (docs/plan.md Phase 88).
            audio.addEventListener('playing', () => setVoiceSpeaking(voiceId, true));
            for (const event of ['pause', 'ended', 'error'] as const) audio.addEventListener(event, () => setVoiceSpeaking(voiceId, false));
            audioRef.current = audio;
          }
          const audio = audioRef.current;
          audio.src = url;
          timerRef.current = window.setTimeout(() => {
            if (request === requestRef.current) void audio.play().catch(() => undefined);
          }, delayMs);
        })
        .catch((failure: unknown) => {
          if (request !== requestRef.current) return;
          setLoading(false);
          setError(failure instanceof Error ? failure.message : 'Could not play the note.');
        });
    },
    [source, soundOn, stop, voiceId]
  );

  const setSoundOn = useCallback(
    (on: boolean) => {
      if (!on) stop();
      setSound(on);
    },
    [stop]
  );

  useEffect(
    () => () => {
      stop();
      setVoiceSpeaking(voiceId, false);
    },
    [stop, voiceId]
  );
  return { play, stop, soundOn, setSoundOn, loading, error };
}

import { useCallback, useEffect, useRef, useState } from 'react';

/** Where a note's audio comes from: the uploaded file on the public page, the
 * browser's voice cache in the editor's preview. Null when the note has none. */
export type NoteAudioSource = (episodeId: string, nodeId: string) => Promise<string | null>;

/** One note plays at a time; stepping on stops the last one. Sound can be
 * switched off. Playback starts from the learner's own click, so browsers
 * allow it. */
export function useNoteAudio(source: NoteAudioSource): {
  play: (episodeId: string, nodeId: string) => void;
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

  const stop = useCallback(() => {
    requestRef.current += 1;
    audioRef.current?.pause();
    setLoading(false);
    setError(null);
  }, []);

  const play = useCallback(
    (episodeId: string, nodeId: string) => {
      stop();
      if (!soundOn) return;
      const request = requestRef.current;
      setLoading(true);
      source(episodeId, nodeId)
        .then((url) => {
          if (request !== requestRef.current) return;
          setLoading(false);
          if (!url) return;
          audioRef.current ??= new Audio();
          audioRef.current.src = url;
          void audioRef.current.play().catch(() => undefined);
        })
        .catch((failure: unknown) => {
          if (request !== requestRef.current) return;
          setLoading(false);
          setError(failure instanceof Error ? failure.message : 'Could not play the note.');
        });
    },
    [source, soundOn, stop]
  );

  const setSoundOn = useCallback(
    (on: boolean) => {
      if (!on) stop();
      setSound(on);
    },
    [stop]
  );

  useEffect(() => stop, [stop]);
  return { play, stop, soundOn, setSoundOn, loading, error };
}

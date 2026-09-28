import type { CourseDocument, TtsBackend } from '@freechesscoach/shared';
import { useEffect, useState } from 'react';
import { decodeCourseAudio } from './clip-player.js';
import { openCourseAudioCache, prepareCourseAudio, type PrepareProgress } from './prepare-audio.js';

export type ClipAudioState =
  | { status: 'preparing'; progress: PrepareProgress }
  | { status: 'error'; message: string }
  | { status: 'ready'; context: AudioContext; buffers: Map<string, AudioBuffer> };

const cache = openCourseAudioCache();

/** Prepares every sentence of the course in the coach's voice (81.1) and
 * decodes it for Web Audio. Re-runs when the text or the voice changes;
 * cached sentences come back at once. */
export function useClipAudio(document: CourseDocument, backend: TtsBackend): ClipAudioState {
  const [state, setState] = useState<ClipAudioState>({ status: 'preparing', progress: { done: 0, total: 0 } });

  useEffect(() => {
    const abort = new AbortController();
    const context = new AudioContext();
    setState({ status: 'preparing', progress: { done: 0, total: 0 } });
    prepareCourseAudio({ document, backend, cache, signal: abort.signal, onProgress: (progress) => !abort.signal.aborted && setState({ status: 'preparing', progress }) })
      .then((prepared) => decodeCourseAudio(context, prepared))
      .then((buffers) => {
        if (!abort.signal.aborted) setState({ status: 'ready', context, buffers });
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not make the coach audio.' });
      });
    return () => {
      abort.abort();
      void context.close();
    };
  }, [document, backend]);

  return state;
}

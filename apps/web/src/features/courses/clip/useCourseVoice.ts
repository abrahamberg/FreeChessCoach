import { useState } from 'react';
import { useProfile } from '../../../hooks/useProfile.js';
import { COURSE_VOICES, type CourseVoice } from './prepare-audio.js';

export type { CourseVoice };

export const COURSE_VOICE_LABELS: Record<CourseVoice, string> = {
  browser: 'Kokoro in the browser (free, slower to make)',
  local: 'Kokoro on your voice server (Settings → Voice)'
};

/** Courses are voiced by Kokoro only (docs/courses.md §8), so every clip and
 * note sounds the same whoever makes it: in the browser, or on the creator's
 * own Kokoro server when that is their voice setting. The clip preview,
 * Preview as learner and publishing share it. */
export function useCourseVoice(): { voice: CourseVoice; setVoice: (voice: CourseVoice) => void; voices: readonly CourseVoice[]; ready: boolean } {
  const profile = useProfile();
  const [picked, setVoice] = useState<CourseVoice | null>(null);
  const voice: CourseVoice = picked ?? (profile.data?.ttsBackend === 'local' ? 'local' : 'browser');
  return { voice, setVoice, voices: COURSE_VOICES, ready: Boolean(profile.data) };
}

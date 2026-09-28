import type { TtsBackend } from '@freechesscoach/shared';
import { useState } from 'react';
import { useLlmSetupStatus } from '../../../hooks/useLlmSetupStatus.js';
import { useProfile } from '../../../hooks/useProfile.js';
import { effectiveTtsBackend } from '../../../tts/effective-tts-backend.js';
import { isOpenAiVoiceAvailable } from '../../../tts/openai-voice-available.js';

/** The voices a course can be recorded with: never the device voice, which
 * gives no audio bytes (docs/courses.md §8). */
export type CourseVoice = Exclude<TtsBackend, 'native'>;

export const COURSE_VOICE_LABELS: Record<CourseVoice, string> = {
  browser: 'In-browser voice (free, slower to make)',
  local: 'Local voice server (Settings → Voice)',
  openai: 'OpenAI voice'
};

/** The creator's voice setting, turned into one a course can use: the
 * device voice becomes the in-browser one. The clip preview and publishing
 * share it, so the clip and the notes sound alike. */
export function useCourseVoice(): { voice: CourseVoice; setVoice: (voice: CourseVoice) => void; voices: CourseVoice[]; ready: boolean } {
  const profile = useProfile();
  const llmSetup = useLlmSetupStatus();
  const openaiAvailable = isOpenAiVoiceAvailable(llmSetup.data);
  const saved = effectiveTtsBackend(profile.data?.ttsBackend ?? 'openai', openaiAvailable);
  const [picked, setVoice] = useState<CourseVoice | null>(null);
  const voice: CourseVoice = picked ?? (saved === 'native' ? 'browser' : saved);
  const voices = (['browser', 'local', 'openai'] as const).filter((each) => each !== 'openai' || openaiAvailable || voice === 'openai');
  return { voice, setVoice, voices, ready: Boolean(profile.data) };
}

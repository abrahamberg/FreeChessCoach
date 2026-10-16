import type { CoachPersona } from '@freechesscoach/shared';
import { effectiveTtsBackend } from '../tts/effective-tts-backend.js';
import { isOpenAiVoiceAvailable } from '../tts/openai-voice-available.js';
import { useCoachVoice, type UseCoachVoiceResult } from './useCoachVoice.js';
import { useLlmSetupStatus } from './useLlmSetupStatus.js';
import { useProfile } from './useProfile.js';

/** The app's coach voice for a page that speaks lines of its own (not a chat
 * transcript), as Settings has it: `enabled` is the Settings switch, and the
 * backend the one the profile and the AI setup allow. */
export function useProfileCoachVoice(persona: CoachPersona): UseCoachVoiceResult & { enabled: boolean } {
  const profile = useProfile().data;
  const llmSetup = useLlmSetupStatus();
  const enabled = profile?.ttsEnabled ?? false;
  const backend = effectiveTtsBackend(profile?.ttsBackend ?? 'openai', isOpenAiVoiceAvailable(llmSetup.data));
  return { ...useCoachVoice({ messages: [], isStreaming: false, persona, enabled, backend }), enabled };
}

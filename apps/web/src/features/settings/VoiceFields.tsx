import type { LlmSetupStatus, UserProfile } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { useUpdateProfile } from '../../hooks/useProfile.js';
import { isOpenAiVoiceAvailable } from '../../tts/openai-voice-available.js';
import { TtsSection } from './TtsSection.js';

/** Coach voice switch and backend. OpenAI voice is only offered when the AI setup has a voice model. */
export function VoiceFields({ profile, llmSetup }: { profile: UserProfile; llmSetup: LlmSetupStatus }): ReactNode {
  const update = useUpdateProfile();
  return (
    <TtsSection
      enabled={profile.ttsEnabled}
      backend={profile.ttsBackend}
      openaiAvailable={isOpenAiVoiceAvailable(llmSetup)}
      onChange={(patch) => update.mutate(patch)}
      persona={profile.coachPersona}
    />
  );
}

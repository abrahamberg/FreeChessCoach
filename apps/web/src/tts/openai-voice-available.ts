import type { LlmSetupStatus } from '@freechesscoach/shared';

/** Whether OpenAI voice can be used. No saved setup, or an unlocked one
 * without a voice model (including local LLMs), means no. A locked setup
 * doesn't reveal its voice model, so it counts as available rather than
 * silently overriding the user's saved choice. Unknown (still loading)
 * also counts as available, to avoid flashing the wrong default. */
export function isOpenAiVoiceAvailable(status: LlmSetupStatus | undefined): boolean {
  if (!status) return true;
  if (!status.configured) return false;
  return status.unlocked ? status.voiceAvailable : true;
}

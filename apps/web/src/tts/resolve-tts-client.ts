import type { TtsBackend } from '@freechesscoach/shared';
import { kokoroTtsClient } from './kokoro-tts-client.js';
import { localTtsClient } from './local-tts-client.js';
import { openaiTtsClient } from './openai-tts-client.js';
import type { TtsClient } from './tts-client.js';

/** 'native' has no client: the device's speechSynthesis plays audio itself
 * and never hands back bytes, so useCoachVoice drives it directly
 * (native-speech.ts) instead of through this blob pipeline. */
export type ClientTtsBackend = Exclude<TtsBackend, 'native'>;

const CLIENTS: Record<ClientTtsBackend, TtsClient> = {
  openai: openaiTtsClient,
  browser: kokoroTtsClient,
  local: localTtsClient
};

/** Which client (openai-tts-client.ts, kokoro-tts-client.ts or
 * local-tts-client.ts) backs a user's `ttsBackend` setting — the one place
 * useCoachVoice needs to know all implementations exist. */
export function resolveTtsClient(backend: ClientTtsBackend): TtsClient {
  return CLIENTS[backend];
}

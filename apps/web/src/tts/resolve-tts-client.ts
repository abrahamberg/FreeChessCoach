import type { TtsBackend } from '@chess-coach/shared';
import { kokoroTtsClient } from './kokoro-tts-client.js';
import { openaiTtsClient } from './openai-tts-client.js';
import type { TtsClient } from './tts-client.js';

/** Which client (openai-tts-client.ts vs. kokoro-tts-client.ts) backs a
 * user's `ttsBackend` setting — the one place useCoachVoice needs to know
 * both implementations exist. */
export function resolveTtsClient(backend: TtsBackend): TtsClient {
  return backend === 'openai' ? openaiTtsClient : kokoroTtsClient;
}

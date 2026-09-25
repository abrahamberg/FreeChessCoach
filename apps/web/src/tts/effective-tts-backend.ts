import type { TtsBackend } from '@freechesscoach/shared';
import { isNativeSpeechSupported } from './native-speech.js';

/** The voice that is actually used. 'openai' is the stored default, so it is
 * what a user who never chose has; without an OpenAI voice model set up it
 * becomes the free device voice (instant, built into the browser) when this
 * browser has one, and the slower browser voice otherwise. Settings, the coach
 * chat and puzzle sessions all read the voice through here so they agree. */
export function effectiveTtsBackend(saved: TtsBackend, openaiAvailable: boolean): TtsBackend {
  if (saved !== 'openai' || openaiAvailable) return saved;
  return isNativeSpeechSupported() ? 'native' : 'browser';
}

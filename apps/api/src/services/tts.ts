import type { CoachPersona } from '@freechesscoach/shared';
import { synthesizeSpeech } from '../llm/openai-tts.js';

/** Matched to each persona's gender/age voice profile (COACH_PERSONA_INFO —
 * see coaches.md) using gpt-4o-mini-tts's voice roster (alloy, ash, ballad,
 * coral, echo, fable, onyx, nova, sage, shimmer, verse). Kept distinct from
 * tts/persona-voices.ts's Kokoro mapping (apps/web) since the two providers
 * don't share voice ids, though several picks echo each other's character
 * (fable/onyx/echo exist in both rosters). `general`/`general_female` get
 * distinct voices despite an identical prompt — that's the whole point,
 * picking the default coach's gender changes nothing else. */
export const PERSONA_VOICES: Record<CoachPersona, string> = {
  general: 'echo', // Male, 40s — warm, grounded, the coach as it's always been.
  general_female: 'coral', // Female, 40s — warm, professional counterpart to "general".
  commander: 'onyx', // Male, 60s — deep, authoritative.
  scholar: 'fable', // Male, 70s — storytelling, unhurried, wise.
  huntress: 'nova', // Female, 20s — bright, precise, sharp.
  shark: 'ash', // Male, 20s — energetic, confident, loud.
  sunzi: 'sage', // Male, 60s — calm, measured, aphoristic.
  gambler: 'verse' // Male, 40s — dynamic, charismatic, versatile.
};

/** Server-level TTS config: just the model id. The API key is resolved
 * per-request from the user's BYOK OpenAI key (see routes/tts.ts), since the
 * app is bring-your-own-key only. */
export interface TtsConfig {
  modelId: string;
}

export interface SpeakParams {
  persona: CoachPersona;
  text: string;
}

/** Synthesizes speech with the user's own OpenAI BYOK key. No credit
 * accounting — usage shows up on the user's own OpenAI bill, same as every
 * other BYOK call. */
export async function speak(config: TtsConfig, apiKey: string, params: SpeakParams): Promise<Buffer> {
  return synthesizeSpeech({
    apiKey,
    modelId: config.modelId,
    voice: PERSONA_VOICES[params.persona],
    text: params.text
  });
}

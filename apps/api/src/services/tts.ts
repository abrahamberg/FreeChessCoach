import type { CoachPersona, StoredLlmSetup } from '@freechesscoach/shared';
import { synthesizeSpeech } from '../llm/openai-tts.js';

export interface PersonaVoice {
  voice: string;
  /** gpt-4o-mini-tts steers delivery from free text, so this is where age and
   * temperament actually land: a voice id alone reads every coach as roughly
   * the same young adult (the Scholar sounded like a student, not a
   * professor in his seventies). */
  instructions: string;
  /** OpenAI's `speed` (1 = normal). Unlike a pace asked for in
   * `instructions`, it's exact every time and leaves pitch alone. Personas
   * the web client pitch-shifts on playback (OPENAI_PLAYBACK_PITCH in
   * apps/web tts/persona-voices.ts) divide their pace by that pitch here, as
   * the shift also changes tempo. */
  speed?: number;
}

/** Matched to each persona's gender/age voice profile (COACH_PERSONA_INFO —
 * see coaches.md) using gpt-4o-mini-tts's voice roster (alloy, ash, ballad,
 * cedar, coral, echo, fable, marin, nova, onyx, sage, shimmer, verse). Kept
 * distinct from tts/persona-voices.ts's Kokoro mapping (apps/web) since the
 * two providers don't share voice ids. `general`/`general_female` get
 * distinct voices despite an identical prompt — that's the whole point,
 * picking the default coach's gender changes nothing else. */
export const PERSONA_VOICES: Record<CoachPersona, PersonaVoice> = {
  general: {
    voice: 'echo',
    instructions: 'A man in his forties. Warm, grounded and friendly, like a patient club coach. Natural conversational pace, gentle encouragement.'
  },
  general_female: {
    voice: 'coral',
    instructions: 'A woman in her forties with a warm, feminine voice. Professional and encouraging, like a patient club coach. Natural conversational pace.'
  },
  commander: {
    voice: 'onyx',
    instructions:
      'A man in his sixties, a retired military officer. Deep, gravelly, authoritative voice. Brisk, clipped delivery, like giving orders: no hesitation, straight to the point. Never shouts, never jokes.',
    speed: 1.5
  },
  // ballad averages ~180 Hz (155–200 measured) even when asked for a deep
  // voice; played back at 0.8x pitch (~144 Hz) so he sits below the Shark.
  // ballad also talks slowly, so heard pace = 1.25 x 0.8 is still unhurried.
  scholar: {
    voice: 'ballad',
    instructions:
      'An elderly British professor in his seventies with a deep, low, warm and slightly gravelly old man\'s voice. Unhurried, thoughtful pace; gently curious, kind and encouraging, like a grandfatherly teacher pausing to consider an idea.',
    speed: 1.25
  },
  // Not nova: it sits low (median pitch ~160 Hz, measured), and reads as a
  // man once the direction adds intensity. marin measures ~200 Hz.
  huntress: {
    voice: 'marin',
    instructions:
      'A young woman in her twenties with a light, clear, feminine voice. Bright, crisp and precise, sharp and focused, with a confident, playful edge, like a hunter who has spotted her target. Brisk pace.'
  },
  // Not ash: ~115 Hz measured, deeper than the 70-year-old Scholar. cedar
  // holds ~146 Hz; played back at 1.15x pitch (~168 Hz), so the youngest man
  // has the highest voice. cedar talks fast, so heard pace = 0.95 x 1.15.
  shark: {
    voice: 'cedar',
    instructions:
      'A very young guy, about nineteen, from the streets of Brooklyn, New York, with a thick Brooklyn accent and a young, light, higher voice. Loud, cocky, high-energy street hustler talking trash on the block. Fast, playful delivery with lots of swagger, slang and laughter in the voice.',
    speed: 0.95
  },
  // Shares onyx with the Commander; the delivery (slow and serene vs. fast
  // and clipped) is what tells them apart.
  sunzi: {
    voice: 'onyx',
    instructions:
      'A man in his sixties, an ancient strategist. Deep, calm and serene voice. Slow, measured, deliberate delivery with meaningful pauses, as if reciting proverbs.'
  },
  // Played back at 0.92x pitch for a deeper voice; heard pace = 1.09 x 0.92.
  gambler: {
    voice: 'verse',
    instructions:
      'A seasoned man in his fifties with a low, deep, slightly weathered and smoky voice. Charismatic, smooth and theatrical card-table showman who has seen it all. Relaxed but teasing, confident delivery with a roguish grin in the voice.',
    speed: 1.09
  }
};

/** Server-level feature gate. Endpoint, API key and voice model come from the
 * user's unlocked setup. */
export interface TtsConfig { readonly enabled: true }

export interface SpeakParams {
  persona: CoachPersona;
  text: string;
}

/** Synthesizes speech with the user's own OpenAI BYOK key. No credit
 * accounting — usage shows up on the user's own OpenAI bill, same as every
 * other BYOK call. */
export async function speak(config: TtsConfig, setup: StoredLlmSetup, params: SpeakParams): Promise<Buffer> {
  if (!config.enabled || !setup.voiceModel) throw new Error('Voice is not configured');
  if (!setup.apiKey) throw new Error('Voice requires an API key (not available for local LLM protocol)');
  const { voice, instructions, speed } = PERSONA_VOICES[params.persona];
  return synthesizeSpeech({
    apiKey: setup.apiKey,
    endpoint: setup.endpoint,
    modelId: setup.voiceModel,
    voice,
    instructions,
    speed,
    text: params.text
  });
}

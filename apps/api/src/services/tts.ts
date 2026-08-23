import type { CoachPersona } from '@chess-coach/shared';
import type { Kysely } from 'kysely';
import * as creditsRepo from '../db/repositories/credits.js';
import type { Database } from '../db/schema.js';
import { synthesizeSpeech } from '../llm/openai-tts.js';
import type { CreditsService } from './credits.js';

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

export interface TtsConfig {
  apiKey: string;
  modelId: string;
  /** AI-credit cost per 1000 characters of input text — env-configurable
   * (AGENTS.md: never hardcode prices), since OpenAI bills TTS per
   * character, not per token, so it can't reuse llm/metering.ts's formula. */
  creditsPer1kChars: number;
}

export interface SpeakParams {
  userId: string;
  sessionId: string | null;
  persona: CoachPersona;
  text: string;
}

export function computeTtsCredits(characterCount: number, creditsPer1kChars: number): number {
  return Math.ceil((characterCount / 1000) * creditsPer1kChars);
}

/** Synthesizes speech and records the spend — debit + call-log row in one
 * transaction, the same "either both happen or neither does" shape as
 * llm/gateway.ts's recordUsage. Character count rides in llm_call_log's
 * existing inputTokens column (outputTokens/cachedInputTokens = 0) rather
 * than adding a TTS-specific column: same table, same audit trail, no schema
 * growth for one more call type. */
export async function speak(
  db: Kysely<Database>,
  config: TtsConfig,
  creditsService: CreditsService,
  params: SpeakParams
): Promise<Buffer> {
  await creditsService.assertCanSpend(params.userId);

  const audio = await synthesizeSpeech({
    apiKey: config.apiKey,
    modelId: config.modelId,
    voice: PERSONA_VOICES[params.persona],
    text: params.text
  });
  const credits = computeTtsCredits(params.text.length, config.creditsPer1kChars);

  await db.transaction().execute(async (trx) => {
    if (credits > 0) {
      await creditsRepo.insertUsageDebit(trx, params.userId, params.sessionId, credits);
    }
    await creditsRepo.insertCallLog(trx, {
      userId: params.userId,
      sessionId: params.sessionId,
      provider: 'openai',
      model: config.modelId,
      inputTokens: params.text.length,
      outputTokens: 0,
      cachedInputTokens: 0,
      creditsMetered: credits,
      purpose: 'tts'
    });
  });

  return audio;
}

import { BotMoveChoiceSchema } from '@freechesscoach/shared';
import type { BotMoveChoiceMessages } from '@freechesscoach/prompts';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import { getModelForUser, recordUsage, type GatewayConfig } from './gateway.js';
import { generateStructured } from './text.js';
import { toBillableTokens } from './usage.js';

/**
 * Play-vs-bot's AI-tiebreak call — same "resolve -> generateStructured ->
 * recordUsage" shape jobs/analyze-game.ts's callPlannerModel uses for the
 * coaching planner. Never throws: a bot's move must never hang or fail the
 * whole request just because this call had a problem (network error, a
 * NoObjectGeneratedError, a timeout) — callers (bot-move-selector) treat
 * `null` as "fall back to weighted sampling."
 */
export async function callBotTiebreak(
  db: Kysely<Database>,
  gatewayConfig: GatewayConfig,
  userId: string,
  messages: BotMoveChoiceMessages
): Promise<string | null> {
  try {
    const resolution = await getModelForUser(db, gatewayConfig, userId, 'light');
    const result = await generateStructured({
      resolution,
      system: messages.system,
      prompt: messages.user,
      schema: BotMoveChoiceSchema
    });

    await recordUsage(db, {
      userId,
      provider: resolution.provider,
      model: resolution.modelId,
      tier: 'light',
      usage: toBillableTokens(result.usage),
      purpose: 'bot_move_tiebreak',
      metered: resolution.metered
    });

    return result.object.moveSan;
  } catch {
    return null;
  }
}

import { z } from 'zod';
import { ENGINE_DEFAULT_DEPTH } from './constants.js';

/** Knobs a bot's personality is built from — see bot-candidate-score.ts
 * (packages/chess-analysis) for how these weight move selection. */
export const BOT_PERSONALITY_TRAITS = ['aggression', 'trapSeeking', 'defensiveness'] as const;
export type BotPersonalityTrait = (typeof BOT_PERSONALITY_TRAITS)[number];

export const BotPersonalitySchema = z.object({
  aggression: z.number().min(0).max(100),
  trapSeeking: z.number().min(0).max(100),
  defensiveness: z.number().min(0).max(100)
});
export type BotPersonality = z.infer<typeof BotPersonalitySchema>;

/**
 * A bot's full behavior, entirely data-driven (docs/architecture.md "Play vs
 * Bot" plan): one shared move-selection engine interprets this config, no
 * per-bot code. `elo` is a display rating only (300 beginner – 2300 most
 * advanced, chess.com-style); `depth` is the knob that actually makes a bot
 * play weaker/stronger (shallower search), deliberately kept separate so a
 * UI-facing "1200 Elo" can stay stable even if depth tuning changes.
 * `bookPlies`/`bookMistakeChance` control opening-book behavior (see
 * packages/chess-analysis/src/opening-book.ts's bookMovesForFen).
 */
export const BotConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Index (0-29) into the 6-column by 5-row portrait sheet at
   * public/brand/bots.png — see apps/web/src/components/BotAvatar.tsx,
   * which computes the CSS crop position from this directly (a uniform
   * grid, unlike CoachAvatar's hand-tuned per-persona framing). */
  avatarIndex: z.number().int().min(0).max(29),
  description: z.string().min(1),
  elo: z.number().int().min(300).max(2300),
  depth: z.number().int().min(1).max(ENGINE_DEFAULT_DEPTH),
  multiPv: z.number().int().min(1).max(8),
  personality: BotPersonalitySchema,
  aiEnabled: z.boolean(),
  temperature: z.number().min(0).max(1),
  bookPlies: z.number().int().min(0).max(30),
  bookMistakeChance: z.number().min(0).max(1)
});
export type BotConfig = z.infer<typeof BotConfigSchema>;

/** Structured output shape for the AI-tiebreak call (apps/api/src/llm/bot-tiebreak.ts)
 * — the model picks exactly one move from a short candidate list, never
 * invents one. Validated against the actual candidate list at the call site
 * before being trusted, same as every other LLM-authored value in this app. */
export const BotMoveChoiceSchema = z.object({ moveSan: z.string() });
export type BotMoveChoice = z.infer<typeof BotMoveChoiceSchema>;

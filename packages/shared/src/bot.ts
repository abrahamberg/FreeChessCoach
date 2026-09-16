import { z } from 'zod';
import { DiagnosisCodeIdSchema } from './diagnosis/catalog-types.js';

/** Knobs a bot's personality is built from — see bot-move-pick.ts
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
 * A bot's full behavior, entirely data-driven: one shared move-selection
 * engine (bot-move-selector.ts / bot-move-pick.ts) interprets this config,
 * no per-bot code. `elo` is a display rating only (300 beginner - 2300 most
 * advanced, chess.com-style) — search depth is fixed at
 * `BOT_SEARCH_DEPTH` (bot-candidates.ts) for every bot and every phase, not
 * a per-bot lever (a bot can no longer be made weaker by shallowing the
 * engine — see docs/plan-bot-engine.md's Phase 64 context). The knobs that
 * actually make a bot play weaker/stronger/differently are `topFiveChance`
 * / `bestMoveGivenTopFiveChance` / `blunderGivenMissChance` (the %A/%B/%C
 * decision tree, bot-move-pick.ts's pickBotMove), `personality`, and the
 * opening-book pair. `bookPlies`/`bookMistakeChance` control opening-book
 * behavior (see packages/chess-analysis/src/bot-opening.ts's
 * selectBookMove).
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
  /** %A — probability the move this bot actually plays comes from the
   * engine's own top-5 ranked candidates at all, rather than the TTC-based
   * tactical-mistake/blunder pool. Rolled once per move, independently of
   * `bestMoveGivenTopFiveChance`/`blunderGivenMissChance` below — see
   * bot-move-pick.ts's pickBotMove for the full three-roll tree. */
  topFiveChance: z.number().min(0).max(1),
  /** %B — conditional on `topFiveChance` hitting: probability the bot plays
   * the engine's actual best move (candidates[0]) outright, rather than
   * another one of its top-5 lines. */
  bestMoveGivenTopFiveChance: z.number().min(0).max(1),
  /** %C — conditional on `topFiveChance` missing: probability the miss is a
   * blunder (large, TTC-plausible material loss) rather than a smaller
   * tactical mistake. */
  blunderGivenMissChance: z.number().min(0).max(1),
  personality: BotPersonalitySchema,
  /** Floor probability (independent of `bestMoveGivenTopFiveChance`) of
   * playing a move the engine's search has flagged as delivering/
   * continuing a forced mate — see bot-move-pick.ts's pickBotMove. Kept
   * below 1.0 even for the strongest tiers so "the bot can always
   * checkmate" still reads as "usually finishes what it can see," not a
   * flawless finish. */
  mateConversionChance: z.number().min(0).max(1),
  /** This bot's documented weaknesses, from the same 410-code taxonomy the
   * coach diagnoses real students against — restricted to
   * `bot-roster.ts`'s `ELIGIBLE_DIAGNOSIS_CODES` (the `TA-*`/`BV-*`/`MS-*`
   * codes a candidate move's own motif or cheap diagnosis-code proxy can
   * actually resolve to), not the full catalog — a bot's move selection
   * has no way to distinguishably manifest, say, a time-management or
   * psychology code. Empty is a legitimate value, not a gap: a well-rounded
   * bot may have no documented weakness at all. See docs/plan.md's Phase 61
   * (original TA-only version) and Phase 62 (widened to BV/MS, elo-scaled
   * breadth) for the full rationale, and `bot-move-pick.ts`'s `pickBotMove`
   * for how this actually changes play. */
  diagnosisCodes: z.array(DiagnosisCodeIdSchema),
  bookPlies: z.number().int().min(0).max(30),
  bookMistakeChance: z.number().min(0).max(1)
});
export type BotConfig = z.infer<typeof BotConfigSchema>;

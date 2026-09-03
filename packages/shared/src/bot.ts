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

/** Upper bound on a phase profile's `depth` — deliberately higher than
 * `ENGINE_DEFAULT_DEPTH` (16, used elsewhere for unrelated defaults). An
 * endgame search over a handful of pieces is cheap enough to justify going
 * deeper than the shared default, and a deeper endgame search is what lets
 * even a weak bot's phase profile still find and finish real mating
 * technique (see bot-game-phase.ts / Phase 60 of docs/plan.md). */
export const BOT_PHASE_DEPTH_MAX = 24;

/** One game phase's move-selection knob — see bot-game-phase.ts's
 * classifyBotGamePhase for how a live position resolves to
 * opening/middlegame/endgame. `depth` is "board sight" (shallower search
 * plays weaker/more short-sighted). The probability of playing the
 * engine's actual top-ranked candidate outright, rolled once per move in
 * this phase, used to be a hand-picked field here too
 * (`bestMoveChance`) — it's now derived live from `BotConfig.elo` and the
 * phase by `packages/chess-analysis/src/bot-skill-curve.ts`'s
 * `bestMoveChanceForElo` (docs/plan.md Phase 62), not stored per bot. */
export const BotPhaseProfileSchema = z.object({
  depth: z.number().int().min(1).max(BOT_PHASE_DEPTH_MAX)
});
export type BotPhaseProfile = z.infer<typeof BotPhaseProfileSchema>;

/**
 * A bot's full behavior, entirely data-driven: one shared move-selection
 * engine (bot-move-selector.ts) interprets this config, no per-bot code.
 * `elo` is a display rating only (300 beginner - 2300 most advanced,
 * chess.com-style) — the knobs that actually make a bot play
 * weaker/stronger/differently are `phases` (per game-phase depth and
 * best-move probability), `personality`, and the opening-book pair.
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
  phases: z.object({
    opening: BotPhaseProfileSchema,
    middlegame: BotPhaseProfileSchema,
    endgame: BotPhaseProfileSchema
  }),
  personality: BotPersonalitySchema,
  /** Floor probability (independent of the current phase's own
   * `bestMoveChance`) of playing a move the engine's phase-appropriate
   * search has flagged as delivering/continuing a forced mate — see
   * bot-move-pick.ts's pickBotMove. Kept below 1.0 even for the strongest
   * tiers so "the bot can always checkmate" still reads as "usually
   * finishes what it can see," not a flawless finish. */
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

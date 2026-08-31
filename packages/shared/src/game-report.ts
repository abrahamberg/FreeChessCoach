import { z } from 'zod';
import { ClassifiedMoveSchema, MOVE_QUALITIES } from './analysis.js';

export const PlayerBookReportSchema = z.object({
  lastBookPly: z.number().int().nonnegative(),
  leftBookPly: z.number().int().nonnegative().nullable(),
  leftBookMove: z.string().nullable(),
  bookAlternatives: z.array(z.string())
});
export type PlayerBookReport = z.infer<typeof PlayerBookReportSchema>;

export const BookReportSchema = z.object({
  source: z.string().min(1),
  eco: z.string().min(1).nullable(),
  ecoVolume: z.enum(['A', 'B', 'C', 'D', 'E']).nullable(),
  name: z.string().min(1).nullable(),
  family: z.string().min(1).nullable(),
  variation: z.string().min(1).nullable(),
  namedAtPly: z.number().int().nonnegative().nullable(),
  lastBookPly: z.number().int().nonnegative(),
  players: z.object({
    white: PlayerBookReportSchema,
    black: PlayerBookReportSchema
  })
});
export type BookReport = z.infer<typeof BookReportSchema>;

/** §5.9 — per-colour counts of each classification. `miss` is counted only
 * here, never re-added under its `underlyingSeverity`; accuracy math always
 * reads the move's raw `drop`, never these counts. */
export const ClassificationCountsSchema = z.object(
  Object.fromEntries(MOVE_QUALITIES.map((quality) => [quality, z.number().int().nonnegative()]))
) as z.ZodObject<Record<(typeof MOVE_QUALITIES)[number], z.ZodNumber>>;
export type ClassificationCounts = z.infer<typeof ClassificationCountsSchema>;

/**
 * The tactic-motif catalogue (Phase 23-24 of the stats-dashboard plan):
 * chess.com-style "found N of M" counters per motif. `opportunities` counts
 * plies where the engine's best move exhibited that motif; `found` counts
 * the subset where the player played that exact move with a best-or-better
 * classification. Pre-existing stored `PlayerReport`s won't have this field
 * (jsonb, no migration) — callers must treat it as absent, not zero.
 */
export const TACTIC_MOTIF_TYPES = [
  'checkmate',
  'brilliantSacrifice',
  'doubleCheck',
  'fork',
  'skewer',
  'pin',
  'discoveredAttack',
  'overloadedDefender',
  'removesDefender',
  'weakBackRank',
  'trappedPiece',
  'freePiece',
  'other'
] as const;
export const TacticMotifTypeSchema = z.enum(TACTIC_MOTIF_TYPES);
export type TacticMotifType = z.infer<typeof TacticMotifTypeSchema>;

const TacticMotifCountSchema = z.object({
  opportunities: z.number().int().nonnegative(),
  found: z.number().int().nonnegative(),
  /** Times the opponent had a reachable tactic of this motif right before
   * the player's move (see computeTacticMotifPrevented). Optional with no
   * default — pre-existing stored GameReports won't have this field (jsonb,
   * no migration); callers must treat it as absent, not zero, so a
   * historical game's dashboard shows "not yet computed" rather than a
   * misleading "0 tactics faced ever". */
  preventable: z.number().int().nonnegative().optional(),
  /** The subset of `preventable` the player actually defused (see
   * computeTacticMotifPrevented). Same optional/no-default/no-migration
   * convention as `preventable` above. */
  prevented: z.number().int().nonnegative().optional()
});
export const TacticMotifCountsSchema = z.object(
  Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, TacticMotifCountSchema]))
) as z.ZodObject<Record<(typeof TACTIC_MOTIF_TYPES)[number], typeof TacticMotifCountSchema>>;
export type TacticMotifCounts = z.infer<typeof TacticMotifCountsSchema>;

/** Phase 26: the "from equal/worse/better positions" and "by theme" buckets
 * the stats dashboard groups endgame games into. */
export const ENDGAME_STANDINGS = ['winning', 'equal', 'worse'] as const;
export const EndgameStandingSchema = z.enum(ENDGAME_STANDINGS);
export type EndgameStanding = z.infer<typeof EndgameStandingSchema>;

export const ENDGAME_THEMES = ['kingAndPawn', 'queen', 'rookAndPawn', 'other'] as const;
export const EndgameThemeSchema = z.enum(ENDGAME_THEMES);
export type EndgameTheme = z.infer<typeof EndgameThemeSchema>;

export const EstimatedRatingReportSchema = z.object({
  value: z.number().int().nullable(),
  range: z.tuple([z.number().int(), z.number().int()]).nullable(),
  confidence: z.enum(['low', 'medium']),
  reason: z.string().optional()
});
export type EstimatedRatingReport = z.infer<typeof EstimatedRatingReportSchema>;

const PhaseConfidenceSchema = z.enum(['ok', 'low', 'none']);
export type PhaseConfidence = z.infer<typeof PhaseConfidenceSchema>;

const NullablePercentSchema = z.number().min(0).max(100).nullable();
const NullableScoreSchema = z.number().nullable();

export const PlayerReportSchema = z.object({
  accuracy: z.number().min(0).max(100),
  phaseAccuracy: z.object({
    opening: NullablePercentSchema,
    middlegame: NullablePercentSchema,
    endgame: NullablePercentSchema
  }),
  phaseConfidence: z.object({
    opening: PhaseConfidenceSchema,
    middlegame: PhaseConfidenceSchema,
    endgame: PhaseConfidenceSchema
  }),
  scores: z.object({
    opening: NullableScoreSchema,
    tactics: NullableScoreSchema,
    strategy: NullableScoreSchema,
    endgame: NullableScoreSchema
  }),
  /** Phase 25: the five named components `scores.strategy` already sums
   * internally, surfaced individually for the stats dashboard's "Strategy"
   * breakdown. Same `< 4` quiet-position null guard as `scores.strategy`. */
  strategySubScores: z.object({
    pawnStructure: NullableScoreSchema,
    spaceAdvantage: NullableScoreSchema,
    activePiece: NullableScoreSchema,
    attacking: NullableScoreSchema,
    defending: NullableScoreSchema
  }),
  /** Phase 26: null/null when the game never reached the endgame phase for
   * this colour — the same signal as `scores.endgame` being null. */
  endgame: z.object({
    standing: EndgameStandingSchema.nullable(),
    theme: EndgameThemeSchema.nullable()
  }),
  counts: ClassificationCountsSchema,
  acpl: z.number().nonnegative(),
  estimatedRating: EstimatedRatingReportSchema,
  tacticMotifs: TacticMotifCountsSchema
});
export type PlayerReport = z.infer<typeof PlayerReportSchema>;

export const GamePhasesSchema = z.object({
  openingEndPly: z.number().int().nonnegative(),
  endgameStartPly: z.number().int().nonnegative().nullable(),
  openingSource: z.enum(['book', 'heuristic'])
});
export type GamePhases = z.infer<typeof GamePhasesSchema>;

export const EngineReportSchema = z.object({
  name: z.string().min(1),
  depth: z.number().int().positive(),
  multiPv: z.number().int().positive()
});
export type EngineReport = z.infer<typeof EngineReportSchema>;

/**
 * §9's top-level report. `book` reuses the richer `BookReportSchema` above
 * (per-colour book-exit detail) rather than the spec's leaner inline shape —
 * it is a superset of the fields §9 asks for and that schema already backs
 * the shipped book-resolution pipeline.
 */
export const GameReportSchema = z.object({
  engine: EngineReportSchema,
  book: BookReportSchema,
  phases: GamePhasesSchema,
  players: z.object({
    white: PlayerReportSchema,
    black: PlayerReportSchema
  }),
  moves: z.array(ClassifiedMoveSchema)
});
export type GameReport = z.infer<typeof GameReportSchema>;

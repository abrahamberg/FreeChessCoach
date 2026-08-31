import { z } from 'zod';

/**
 * The tactic-motif catalogue (Phase 23-24 of the stats-dashboard plan):
 * chess.com-style "found N of M" counters per motif. `opportunities` counts
 * plies where the engine's best move exhibited that motif; `found` counts
 * the subset where the player played that exact move with a best-or-better
 * classification. Pre-existing stored `PlayerReport`s won't have this field
 * (jsonb, no migration) — callers must treat it as absent, not zero.
 *
 * Its own leaf module (no imports of its own) so both `analysis.ts` (a
 * single move's `tacticOpportunity`/`tacticPrevention`) and `game-report.ts`
 * (`TacticMotifCountsSchema`, the per-game tally) can use it without a
 * circular import — `game-report.ts` already imports `ClassifiedMoveSchema`
 * from `analysis.ts`, so `analysis.ts` importing the motif enum back from
 * `game-report.ts` would cycle.
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

/** chess.com's own category names for these motifs — shared by the web
 * stats dashboard and the coach prompt's tactics summary so the two never
 * drift to different wording for the same motif. */
export const TACTIC_MOTIF_LABELS: Record<TacticMotifType, string> = {
  checkmate: 'Checkmates',
  brilliantSacrifice: 'Brilliant Sacrifices',
  doubleCheck: 'Double Checks',
  fork: 'Forks',
  skewer: 'Skewers',
  pin: 'Pins',
  discoveredAttack: 'Discoveries',
  overloadedDefender: 'Overloaded Defenders',
  removesDefender: 'Removes Defender',
  weakBackRank: 'Weak Back-Rank',
  trappedPiece: 'Trapped Pieces',
  freePiece: 'Free Pieces',
  other: 'Other Tactics'
};

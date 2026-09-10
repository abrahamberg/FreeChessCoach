import { z } from 'zod';
import { TacticMotifTypeSchema } from './tactic-motif.js';

/**
 * Layer 5 of `docs/tactics-rework.md` §5: a game-level note measured against
 * *this player*, not against zero.
 *
 * "You allowed a fork this game, which is unusual for you" is a different
 * product from "Tactics: 1 allowed", and the difference is entirely in the
 * denominator. The cross-game aggregate that supplies it has been computed
 * since the stats dashboard shipped and nothing consumed it for copy.
 */

/** Which side of the ledger the note is about. `missed` and `found` are the
 * player's own chances; `allowed` is the opponent's, which the player could
 * have prevented. */
export const TACTIC_BASELINE_KINDS = ['missed', 'allowed', 'found'] as const;
export const TacticBaselineKindSchema = z.enum(TACTIC_BASELINE_KINDS);
export type TacticBaselineKind = z.infer<typeof TacticBaselineKindSchema>;

/**
 * How hard the note should land.
 *
 * `unusual` is a lapse against a good record — a note, not a weakness, and
 * chess.com's own copy for it ends "—no big deal!". `habit` is the same lapse
 * against a record that already shows it, which is the one worth training.
 * `strength` is the good direction.
 */
export const TACTIC_BASELINE_TONES = ['unusual', 'habit', 'strength'] as const;
export const TacticBaselineToneSchema = z.enum(TACTIC_BASELINE_TONES);
export type TacticBaselineTone = z.infer<typeof TacticBaselineToneSchema>;

export const TacticBaselineNoteSchema = z.object({
  motif: TacticMotifTypeSchema,
  kind: TacticBaselineKindSchema,
  tone: TacticBaselineToneSchema,
  /** This game's rate for `kind` — missed of opportunities, allowed of
   * preventable, found of opportunities. */
  gameRate: z.number().min(0).max(1),
  /** The same rate across the player's other games. */
  baselineRate: z.number().min(0).max(1),
  /** How many chances this game gave, and how many the baseline rests on —
   * a note about one chance in one game reads differently from a note about
   * nine, and the copy says so. */
  gameChances: z.number().int().nonnegative(),
  baselineChances: z.number().int().nonnegative(),
  baselineGames: z.number().int().nonnegative()
});
export type TacticBaselineNoteDto = z.infer<typeof TacticBaselineNoteSchema>;

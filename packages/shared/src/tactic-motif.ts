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
 *
 * The list is grouped by family (`TACTIC_MOTIF_FAMILY` below) and the
 * original thirteen come first, so a stored report's key order is unchanged
 * and any UI that renders `TACTIC_MOTIF_TYPES` in order keeps the tactics it
 * always showed at the top. `docs/tactics-rework.md` §6 is where the target
 * set comes from: the offence-only vocabulary is why a defensive or quiet
 * move used to fall through to "Nothing to flag".
 */
export const TACTIC_MOTIF_TYPES = [
  // --- the original thirteen -------------------------------------------
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
  'other',
  // --- offensive additions ---------------------------------------------
  'discoveredCheck',
  'deflection',
  'decoy',
  'interference',
  'clearance',
  'xRayAttack',
  'zwischenzug',
  'desperado',
  'windmill',
  'smotheredMate',
  'matingNet',
  'promotionTactic',
  'underPromotion',
  'pawnBreakthrough',
  'attractionSac',
  // --- defensive & prophylactic ----------------------------------------
  'breaksPin',
  'escapesFork',
  'defendsHangingPiece',
  'blocksThreat',
  'counterAttack',
  'removesTarget',
  'perpetualCheck',
  'stalemateResource',
  'simplifiesToDraw',
  'prophylaxis',
  // --- positional, so "quiet" isn't silence ----------------------------
  'gainsTempo',
  'develops',
  'improvesWorstPiece',
  'seizesOpenFile',
  'outpost',
  'spaceGain',
  'preparesBreak',
  'favourableTrade',
  'kingSafety'
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
  other: 'Other Tactics',
  discoveredCheck: 'Discovered Checks',
  deflection: 'Deflections',
  decoy: 'Decoys',
  interference: 'Interferences',
  clearance: 'Clearances',
  xRayAttack: 'X-Ray Attacks',
  zwischenzug: 'In-Between Moves',
  desperado: 'Desperados',
  windmill: 'Windmills',
  smotheredMate: 'Smothered Mates',
  matingNet: 'Mating Nets',
  promotionTactic: 'Promotions',
  underPromotion: 'Underpromotions',
  pawnBreakthrough: 'Pawn Breakthroughs',
  attractionSac: 'Attraction Sacrifices',
  breaksPin: 'Broken Pins',
  escapesFork: 'Fork Escapes',
  defendsHangingPiece: 'Hanging-Piece Saves',
  blocksThreat: 'Blocked Threats',
  counterAttack: 'Counter-Attacks',
  removesTarget: 'Removed Targets',
  perpetualCheck: 'Perpetual Checks',
  stalemateResource: 'Stalemate Resources',
  simplifiesToDraw: 'Simplifications',
  prophylaxis: 'Prophylaxis',
  gainsTempo: 'Tempo Gains',
  develops: 'Developing Moves',
  improvesWorstPiece: 'Worst-Piece Improvements',
  seizesOpenFile: 'Open Files',
  outpost: 'Outposts',
  spaceGain: 'Space Gains',
  preparesBreak: 'Prepared Breaks',
  favourableTrade: 'Favourable Trades',
  kingSafety: 'King Safety'
};

/**
 * Which of `docs/tactics-rework.md` §6's four groups a motif belongs to.
 * `offensive` is something done to the opponent, `defensive` something that
 * stops the opponent doing it, `positional` a quiet idea with no immediate
 * material claim, and `outcome` the two labels that describe how the move
 * ended rather than the mechanism it used (`checkmate`,
 * `brilliantSacrifice`) plus the `other` catch-all.
 *
 * The narrator reads this to pick a verb — you *win* material through an
 * offensive motif but you *stop* something with a defensive one — so a new
 * motif that lands in the wrong family reads wrong in the card, not just in
 * a dashboard grouping.
 */
export const TACTIC_MOTIF_FAMILIES = ['offensive', 'defensive', 'positional', 'outcome'] as const;
export type TacticMotifFamily = (typeof TACTIC_MOTIF_FAMILIES)[number];

export const TACTIC_MOTIF_FAMILY: Record<TacticMotifType, TacticMotifFamily> = {
  checkmate: 'outcome',
  brilliantSacrifice: 'outcome',
  other: 'outcome',
  doubleCheck: 'offensive',
  fork: 'offensive',
  skewer: 'offensive',
  pin: 'offensive',
  discoveredAttack: 'offensive',
  overloadedDefender: 'offensive',
  removesDefender: 'offensive',
  weakBackRank: 'offensive',
  trappedPiece: 'offensive',
  freePiece: 'offensive',
  discoveredCheck: 'offensive',
  deflection: 'offensive',
  decoy: 'offensive',
  interference: 'offensive',
  clearance: 'offensive',
  xRayAttack: 'offensive',
  zwischenzug: 'offensive',
  desperado: 'offensive',
  windmill: 'offensive',
  smotheredMate: 'offensive',
  matingNet: 'offensive',
  promotionTactic: 'offensive',
  underPromotion: 'offensive',
  pawnBreakthrough: 'offensive',
  attractionSac: 'offensive',
  breaksPin: 'defensive',
  escapesFork: 'defensive',
  defendsHangingPiece: 'defensive',
  blocksThreat: 'defensive',
  counterAttack: 'defensive',
  removesTarget: 'defensive',
  perpetualCheck: 'defensive',
  stalemateResource: 'defensive',
  simplifiesToDraw: 'defensive',
  prophylaxis: 'defensive',
  gainsTempo: 'positional',
  develops: 'positional',
  improvesWorstPiece: 'positional',
  seizesOpenFile: 'positional',
  outpost: 'positional',
  spaceGain: 'positional',
  preparesBreak: 'positional',
  favourableTrade: 'positional',
  kingSafety: 'positional'
};

/** The motifs of one family, in `TACTIC_MOTIF_TYPES` order. */
export function tacticMotifsInFamily(family: TacticMotifFamily): TacticMotifType[] {
  return TACTIC_MOTIF_TYPES.filter((type) => TACTIC_MOTIF_FAMILY[type] === family);
}

/**
 * What a tactic claim is worth, in the currency the card's sentence has to
 * name. `docs/tactics-rework.md` §3 rule 1: the payoff is the subject of the
 * sentence, so a claim that cannot say what it gets you cannot produce a
 * card — "win a rook" (material), "force mate" (mate), "win a tempo"
 * (tempo), "bind their bishop" (positional), "save the knight" (safety).
 */
export const TACTIC_GAIN_KINDS = ['material', 'mate', 'tempo', 'positional', 'safety'] as const;
export const TacticGainKindSchema = z.enum(TACTIC_GAIN_KINDS);
export type TacticGainKind = z.infer<typeof TacticGainKindSchema>;

/** How far away the payoff is — §3 rule 5's "an *eventual* fork". */
export const TACTIC_HORIZONS = ['immediate', 'inTwo', 'eventual'] as const;
export const TacticHorizonSchema = z.enum(TACTIC_HORIZONS);
export type TacticHorizon = z.infer<typeof TacticHorizonSchema>;

/** The verified payoff behind a card's headline claim. `pawns` is the
 * material swing the verifier could actually show (0 for a bind or a
 * tempo); `prize` names the piece for the "win a <piece>" slot and is null
 * whenever the gain isn't a specific piece. */
export const TacticGainSchema = z.object({
  kind: TacticGainKindSchema,
  pawns: z.number(),
  prize: z.string().nullable()
});
export type TacticGainDto = z.infer<typeof TacticGainSchema>;

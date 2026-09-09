import type { Square } from 'chess.js';
import type { TacticGainKind, TacticMotifType, TacticVisualDto } from '@freechesscoach/shared';

export type { TacticGainKind } from '@freechesscoach/shared';

/**
 * Layer 1's output: one thing a detector believes this move does, with the
 * concrete squares that make it checkable.
 *
 * Detectors *propose* claims and are deliberately loose — layer 2
 * (`verify-tactic-claims.ts`) is what decides which survive, so a detector
 * that hedges is worse than one that over-proposes. Every claim is
 * move-scoped: `actor` is a square the move itself created activity on, not
 * any piece on the board that happens to fit the shape.
 *
 * The claim also carries its own `evidence` and `detail`, so the card's
 * sentence and the board arrow come from one object instead of a second
 * replay in `tactic-hit-detail.ts`.
 */
export interface TacticClaim {
  type: TacticMotifType;
  /** The square of the piece doing the work — for a discovered attack, the
   * unveiled piece, not the one that stepped aside. */
  actor: Square;
  /** Every enemy (or, for a defensive claim, own) square the claim bears
   * on. The attribution test in layer 2 asks whether the line's material is
   * won on one of these. */
  targets: readonly Square[];
  /** The piece expected to fall, when the claim expects one to. `null` for
   * every non-material claim — a pin that binds, a move that develops. */
  victim: Square | null;
  gainKind: TacticGainKind;
  /** Static estimate of the claim's worth in pawns. 0 for a claim whose
   * gain isn't material; layer 2 replaces it with what the line actually
   * paid. */
  expectedGain: number;
  /** The name of the piece at `victim` ("bishop"), for the narrator's
   * "win a <piece>" slot. `null` whenever `victim` is. */
  prize: string | null;
  /** Arrows/highlights for the Game Review board. */
  evidence: TacticVisualDto;
  /** The full clause naming the concrete pieces and squares — the
   * high-specificity rung of §3 rule 2. The narrator drops it at medium
   * confidence and shows the bare motif instead. */
  detail: string;
}

/** Identity of a claim for set comparison: the same motif by the same piece
 * against the same targets. Used by the prevention path (which asks whether
 * a specific threat is still live, not whether a type name is still in a
 * set) and to de-duplicate claims two detectors both propose. */
export function tacticClaimKey(claim: TacticClaim): string {
  return `${claim.type}:${claim.actor}:${[...claim.targets].sort().join('+')}`;
}

/** Keeps the first claim per `tacticClaimKey`, preserving order. Detectors
 * run independently and a shape can legitimately be proposed twice (a
 * discovered check is also a discovered attack); the ranker wants one entry
 * per distinct claim, not per detector that noticed it. */
export function dedupeTacticClaims(claims: readonly TacticClaim[]): TacticClaim[] {
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const key = tacticClaimKey(claim);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

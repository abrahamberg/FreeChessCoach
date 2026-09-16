import type { EngineLine, TacticMotifType } from '@freechesscoach/shared';
import { scanAvailableMotifs, threatKey, type PvMotifSighting } from './available-motifs-scan.js';

/**
 * Pure, engine-free check: which of `opponent`'s threats available at
 * `beforeFen` are no longer reachable by `afterFen`?
 *
 * Both FENs must already have `opponent` as the side to move.
 * `candidateLinesBefore`/`candidateLinesAfter` are each independently
 * anchored to their own real position — see the call sites' comments in
 * `apps/api/src/services/tactic-prevention.ts` for exactly which FEN/eval
 * pair each is built from.
 *
 * Compares **verified claims by the square they threaten**
 * (`threatKey`), not sets of motif type names. The type-level comparison it
 * replaces is `docs/tactics-rework.md` §4 cause 6: it amplified every
 * layer-1 false positive into a second false sentence ("Defused the
 * opponent's fork" on a fork that never existed), and it also went the other
 * way — an unrelated new fork somewhere else made a genuinely defused one
 * read as still live. A motif type counts as defused when every threat of
 * that type that was there before is gone, which is a question about pieces
 * rather than about vocabulary.
 *
 * The remaining accepted trade-off is unchanged: even-ply moves are the
 * engine's own guess, so a credited ply-3+ sighting is inherently less
 * certain than a ply-1 one — which is why the schedule concentrates depth on
 * the top-ranked line, so cost control and confidence point the same way.
 */
export function findDefusedThreats(
  beforeFen: string,
  afterFen: string,
  opponent: 'white' | 'black',
  candidateLinesBefore: readonly EngineLine[],
  candidateLinesAfter: readonly EngineLine[]
): TacticMotifType[] {
  return scanThreatOutcome(beforeFen, afterFen, opponent, candidateLinesBefore, candidateLinesAfter).defused;
}

export interface ThreatOutcome {
  /** Every motif type `opponent` could have executed at `beforeFen` — the
   * denominator for "tactics prevented" (see computeTacticMotifPrevented):
   * a motif the opponent could have played, whether or not the mover's reply
   * actually defused it. */
  preventable: TacticMotifType[];
  /** The subset of `preventable` whose every individual threat is gone at
   * `afterFen` — identical to `findDefusedThreats`'s return value. */
  defused: TacticMotifType[];
  /** `beforeFen`'s own raw sightings (unfiltered by `afterFen`), each
   * carrying the claim it was found as — so a caller can name and draw the
   * concrete threat rather than showing the bare type name. */
  sightings: PvMotifSighting[];
  /** The sightings whose threat is gone, in `sightings` order. What a card
   * saying "their move stopped you winning a rook" is written from. */
  defusedSightings: PvMotifSighting[];
}

/**
 * The combined before/after scan `findDefusedThreats` is built on, with the
 * "before" set (discarded there) surfaced too — both are derived from the
 * same two `scanAvailableMotifs` calls, so exposing `preventable` costs
 * nothing extra.
 */
export function scanThreatOutcome(
  beforeFen: string,
  afterFen: string,
  opponent: 'white' | 'black',
  candidateLinesBefore: readonly EngineLine[],
  candidateLinesAfter: readonly EngineLine[]
): ThreatOutcome {
  const before = scanAvailableMotifs(beforeFen, candidateLinesBefore);
  const after = scanAvailableMotifs(afterFen, candidateLinesAfter);
  const stillLive = new Set(after.sightings.map((sighting) => threatKey(sighting.claim)));

  const defusedSightings = before.sightings.filter((sighting) => !stillLive.has(threatKey(sighting.claim)));
  const defusedTypes = new Set(defusedSightings.map((sighting) => sighting.motif));
  const survivingTypes = new Set(
    before.sightings.filter((sighting) => stillLive.has(threatKey(sighting.claim))).map((sighting) => sighting.motif)
  );

  const preventable = [...before.motifs];
  return {
    preventable,
    // A type is defused only when nothing of that type survived: one fork
    // answered while another is still on the board is not "you stopped their
    // fork".
    defused: preventable.filter((motif) => defusedTypes.has(motif) && !survivingTypes.has(motif)),
    sightings: before.sightings,
    defusedSightings
  };
}

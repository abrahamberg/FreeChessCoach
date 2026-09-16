import type { DiagnosisCodeId } from '@freechesscoach/shared';
import type { CandidateMoveAnnotation } from '../candidate-moves.js';

/**
 * Every code `candidateDiagnosisCodes` can produce — the `BV`/`MS`
 * counterpart to `motif-to-code.ts`'s `MOTIF_RESOLVABLE_DIAGNOSIS_CODES`
 * (`TA`). Used by the bot roster (`packages/shared/src/bot-roster.ts`) to
 * enforce that a bot is only ever "documented" with a code its move
 * selection can genuinely steer toward — see docs/plan.md Phase 62.
 */
export const CANDIDATE_PROXY_RESOLVABLE_DIAGNOSIS_CODES: readonly DiagnosisCodeId[] = ['BV-01', 'BV-02', 'MS-02', 'MS-03'];

/**
 * Cheap, no-extra-engine-call approximation of which `BV`/`MS` diagnosis
 * codes a single candidate move exhibits, from signals
 * `annotateCandidateMoves` already computes. This is a steering proxy, not
 * the canonical tag — Task 62.4's real detector pass (run once, on
 * whichever move actually gets played) is the accuracy backstop; this only
 * needs to be good enough to bias sampling toward a bot's documented
 * weaknesses.
 *
 * - `BV-01` (own hanging-piece blindness): the candidate creates a new
 *   hanging piece of the mover's own, or leaves an already-hanging one of
 *   the mover's own pieces unaddressed.
 * - `MS-03` (opponent-direct-threat omission): approximated by the same
 *   "creates" signal — the move itself walks into a threat the mover
 *   didn't see coming from playing it.
 * - `MS-02` (opponent-capture scan omission): approximated by the same
 *   "ignores" signal — an existing capture the mover already had to reckon
 *   with, left unaddressed.
 * - `BV-02` (opponent hanging-piece blindness): the candidate leaves an
 *   already-hanging *opponent* piece uncaptured.
 */
export function candidateDiagnosisCodes(annotation: CandidateMoveAnnotation): DiagnosisCodeId[] {
  const codes = new Set<DiagnosisCodeId>();

  if (annotation.createsOwnHangingPiece) {
    codes.add('BV-01');
    codes.add('MS-03');
  }
  if (annotation.ignoresOwnHangingPiece) {
    codes.add('BV-01');
    codes.add('MS-02');
  }
  if (annotation.ignoresOpponentHangingPiece) {
    codes.add('BV-02');
  }

  return Array.from(codes);
}

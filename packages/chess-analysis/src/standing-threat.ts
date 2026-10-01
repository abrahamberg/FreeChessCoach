import { Chess } from 'chess.js';
import { fenActiveColor } from './attack-map.js';
import { threatKey, type PvMotifSighting } from './available-motifs-scan.js';
import { classifyCandidateClaims } from './classify-candidate-move.js';
import { flipActiveColorFen } from './null-move-fen.js';
import { claimWinsSomething } from './realistic-threats.js';
import type { VerifiedTacticClaim } from './verify-tactic-claims.js';

/** A threat as it stands on the board the reader sees. */
export interface StandingThreat {
  /** The threat's move as that board writes it. */
  moveSan: string;
  /** The position it is played from: `fenBefore` with the turn passed. */
  fenBefore: string;
  /** The claim read off that board, so its squares, prize and arrows are
   * the reader's, not the scan's. */
  claim: VerifiedTacticClaim;
}

/**
 * The threat `sighting` stands for, as the opponent's next move in
 * `fenBefore` (the position before the move under review, mover to move).
 *
 * A prevention sighting is seen from another board: the position before the
 * opponent's previous move, often several plies down an engine line
 * (`available-motifs-scan.ts`). Its claim names the pieces of that board.
 * A move only stopped a threat that was there when it was played, so the
 * threat's move is replayed with the turn passed and classified again by
 * the same registry. `null` when the mover is in check (no pass exists),
 * when the move is not legal there, or when it no longer carries the same
 * threat (`threatKey`) with something to win: the opponent already played
 * it, their own previous move ended it, or it existed only after a reply
 * the engine guessed. Also `null` when the move mates on this board and the
 * sighting was not a mate: "stopped them winning a pawn through a skewer
 * with Rh8#" hides the one thing the move was.
 */
export function standingThreat(sighting: PvMotifSighting, fenBefore: string): StandingThreat | null {
  const passed = flipActiveColorFen(fenBefore);
  if (!passed) return null;
  const played = playedOn(passed, sighting.moveSan);
  if (!played) return null;

  const key = threatKey(sighting.claim);
  const claims = classifyCandidateClaims(passed, played.san, fenActiveColor(passed))?.claims ?? [];
  const claim = claims.find((each) => threatKey(each) === key && claimWinsSomething(each));
  if (!claim || (played.mates && claim.gainKind !== 'mate')) return null;
  return { moveSan: played.san, fenBefore: passed, claim };
}

/** `san` as `fen`'s own board writes it (a check or a capture may differ
 * from the scan's board) and whether it mates there; `null` when it is not
 * legal there. */
function playedOn(fen: string, san: string): { san: string; mates: boolean } | null {
  try {
    const board = new Chess(fen);
    const move = board.move(san);
    return { san: move.san, mates: board.isCheckmate() };
  } catch {
    return null;
  }
}

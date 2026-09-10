import { describe, expect, test } from 'vitest';
import { annotateCandidateMoves } from './candidate-moves.js';

// White knight f4-d5 forks the black rook on b6 and knight on f6, with the
// c4 pawn defending d5 so the forking knight isn't simply taken and the d6
// pawn blocking the rook's guard of f6 so both targets really fall (same
// pattern as diff-features.test.ts's FORK_FEN, reached here via an actual
// legal move instead of being hand-placed).
const FORK_SETUP_FEN = '4k3/8/1r1p1n2/8/2P2N2/8/8/7K w - - 0 1';

describe('annotateCandidateMoves', () => {
  test('flags a fork-creating candidate with createsFork: true', () => {
    const [annotation] = annotateCandidateMoves(FORK_SETUP_FEN, ['Nd5']);

    expect(annotation).toBeDefined();
    expect(annotation?.moveSan).toBe('Nd5');
    expect(annotation?.createsFork).toBe(true);
  });

  test('a non-fork candidate is flagged createsFork: false', () => {
    const [annotation] = annotateCandidateMoves(FORK_SETUP_FEN, ['Kg2']);

    expect(annotation).toBeDefined();
    expect(annotation?.createsFork).toBe(false);
  });

  test('silently skips an illegal candidate SAN instead of throwing', () => {
    const results = annotateCandidateMoves(FORK_SETUP_FEN, ['Nd5', 'Zz9', 'Kg2']);

    expect(() => annotateCandidateMoves(FORK_SETUP_FEN, ['Zz9'])).not.toThrow();
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.moveSan)).toEqual(['Nd5', 'Kg2']);
  });

  test('reports mobilityDelta as the change in legal move count from fenBefore', () => {
    const [annotation] = annotateCandidateMoves(FORK_SETUP_FEN, ['Nd5']);

    expect(annotation?.mobilityDelta).toBeTypeOf('number');
  });

  test('flags createsHangingPiece when the candidate leaves a new hanging piece', () => {
    // Queen d1-d5 (non-capture) walks into an undefended square attacked by
    // the black rook on d8 down the open file — a fresh hanging piece.
    const fenBefore = '3rk3/8/8/8/8/8/8/3Q3K w - - 0 1';
    const [annotation] = annotateCandidateMoves(fenBefore, ['Qd5']);

    expect(annotation?.createsHangingPiece).toBe(true);
  });

  test('a self-blunder is flagged createsOwnHangingPiece, not createsOpponentHangingPiece', () => {
    // Same walk-into-the-open-file blunder as above: the newly hanging
    // piece is the mover's own queen.
    const fenBefore = '3rk3/8/8/8/8/8/8/3Q3K w - - 0 1';
    const [annotation] = annotateCandidateMoves(fenBefore, ['Qd5']);

    expect(annotation?.createsOwnHangingPiece).toBe(true);
    expect(annotation?.createsOpponentHangingPiece).toBe(false);
  });

  test('a genuine attacking threat is flagged createsOpponentHangingPiece, not createsOwnHangingPiece', () => {
    // White queen a1-a4 attacks the undefended black knight on d4 along the
    // open 4th rank without itself coming under attack — the newly hanging
    // piece is the opponent's, i.e. a real threat, not a self-blunder.
    const fenBefore = '4k3/8/8/8/3n4/8/8/Q3K3 w - - 0 1';
    const [annotation] = annotateCandidateMoves(fenBefore, ['Qa4']);

    expect(annotation?.createsOpponentHangingPiece).toBe(true);
    expect(annotation?.createsOwnHangingPiece).toBe(false);
  });

  test('createsUnderDefendedPiece is true when the candidate creates a newly under-defended piece', () => {
    // White queen captures onto d7: afterward it is attacked 3x (rook d8,
    // knight b6, king c8) but defended only once (knight e5) — under-
    // defended (attackers > defenders > 0, so not "hanging"), and absent
    // beforehand since d7 held the black queen, not a white piece.
    const fenBefore = '2kr4/3q4/1n6/4N3/8/8/8/3QK3 w - - 0 1';
    const [annotation] = annotateCandidateMoves(fenBefore, ['Qxd7']);

    expect(annotation?.moveSan).toBe('Qxd7');
    expect(annotation?.createsUnderDefendedPiece).toBe(true);
    expect(annotation?.createsHangingPiece).toBe(false);
  });

  test('ignoresOwnHangingPiece is true when a move leaves an already-hanging own piece unaddressed', () => {
    // White queen already hangs to the black rook on d8 down the open
    // d-file before the move. Kh2 does nothing about it — the queen is
    // still on d5, still hanging, afterward.
    const fenBefore = '3rk3/8/8/3Q4/8/8/8/7K w - - 0 1';
    const [annotation] = annotateCandidateMoves(fenBefore, ['Kh2']);

    expect(annotation?.ignoresOwnHangingPiece).toBe(true);
  });

  test('ignoresOwnHangingPiece is false once the candidate addresses the existing threat', () => {
    // Same position, but the queen itself moves off the d-file to safety.
    const fenBefore = '3rk3/8/8/3Q4/8/8/8/7K w - - 0 1';
    const [annotation] = annotateCandidateMoves(fenBefore, ['Qa5']);

    expect(annotation?.ignoresOwnHangingPiece).toBe(false);
  });

  test('ignoresOpponentHangingPiece is true when a move leaves an already-hanging enemy piece uncaptured', () => {
    // The black knight on d4 is already hanging to the queen on a4 before
    // the move; a quiet king move does nothing about it.
    const fenBefore = '4k3/8/8/8/Q2n4/8/8/4K3 w - - 0 1';
    const [annotation] = annotateCandidateMoves(fenBefore, ['Kf1']);

    expect(annotation?.ignoresOpponentHangingPiece).toBe(true);
  });

  test('ignoresOpponentHangingPiece is false once the candidate captures the hanging piece', () => {
    const fenBefore = '4k3/8/8/8/Q2n4/8/8/4K3 w - - 0 1';
    const [annotation] = annotateCandidateMoves(fenBefore, ['Qxd4']);

    expect(annotation?.ignoresOpponentHangingPiece).toBe(false);
  });

  test('tags a fork-creating candidate with motif: fork', () => {
    const [annotation] = annotateCandidateMoves(FORK_SETUP_FEN, ['Nd5']);

    expect(annotation?.motif).toBe('fork');
  });
});

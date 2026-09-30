import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { abandonedGuard, betterMoveFacts } from './better-move.js';

const after = (pgn: string): string => {
  const chess = new Chess();
  chess.loadPgn(pgn);
  return chess.fen();
};

describe('why the better move was better', () => {
  test('"keeps X safe" only for a piece standing there after the better move', () => {
    // 6.hxg4 put the pawn on g4; c3 keeps no "pawn on g4" safe.
    const why = betterMoveFacts('r1bqkb1r/pppp1pp1/2n5/1B2p2p/4P1n1/5N1P/PPPP1PP1/RNBQ1RK1 w kq - 0 6', 'hxg4', 'c3');
    expect(why.filter((fact) => fact.kind === 'keepsSafe').map((fact) => fact.piece.square)).not.toContain('g4');
    // A better move that moves the loose piece takes it out of danger, not "keeps it safe".
    const away = betterMoveFacts('4k3/8/p7/1B6/8/8/8/4K3 w - - 0 1', 'Kd2', 'Bc4');
    expect(away).toContainEqual({ kind: 'takesOutOfDanger', piece: { piece: 'b', square: 'b5' } });
    expect(away.filter((fact) => fact.kind === 'keepsSafe')).toEqual([]);
  });

  test('"stops guarding" only a square the piece guarded before and not after, never the one it moved to', () => {
    // The Englund after 7.Qd2: 7…Bxc3 8.Qxc3 Qc1#, the queen left c1's guard.
    const fen = after('1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2 6. Bc3 Bb4 7. Qd2 Bxc3');
    expect(abandonedGuard(fen, 'Qxc3', 'Qc1#')).toEqual([{ kind: 'stopsGuarding', piece: 'q', square: 'c1', replySan: 'Qc1#' }]);
    expect(abandonedGuard(fen, 'Qxc3', undefined)).toEqual([]);
    // Landing on the square is not leaving it.
    const before = after('1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2 6. Bc3 Bb4 7. Qd2');
    expect(abandonedGuard(before, 'Bxc3', 'Nxc3')).toEqual([]);
  });
});

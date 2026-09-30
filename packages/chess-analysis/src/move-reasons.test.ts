import type { EngineEval, MoveQuality } from '@freechesscoach/shared';
import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { buildReasons } from './move-reasons.js';

const reasons = (fenBefore: string, moveSan: string, quality: MoveQuality): string[] => {
  const chess = new Chess(fenBefore);
  const mover = chess.turn() === 'w' ? 'white' : 'black';
  chess.move(moveSan);
  const evalBefore: EngineEval = { ply: 0, fen: fenBefore, depth: 0, lines: [] };
  return buildReasons({ mover, fenBefore, fenAfter: chess.fen(), moveSan, evalBefore, quality, isBookMove: false });
};

describe('review notes from the board facts', () => {
  test('a loose piece is named on a move that cost something', () => {
    // …Qd4 walks into the rook on d1 with nothing behind it.
    expect(reasons('4k3/8/8/8/q7/8/8/3RK3 b - - 0 1', 'Qd4', 'blunder')).toContain('Leaves the queen on d4 undefended');
  });

  test('a best move gets no fault note', () => {
    expect(reasons('4k3/8/8/8/q7/8/8/3RK3 b - - 0 1', 'Qd4', 'best').join(' ')).not.toContain('Leaves');
  });

  test('a trade is not a loose piece', () => {
    expect(reasons('4k3/8/2p5/3n4/8/2N5/8/4K3 w - - 0 1', 'Nxd5', 'mistake').join(' ')).not.toContain('Leaves the knight on d5');
  });

  test('a defended knight attacked by a pawn can be won', () => {
    expect(reasons('4k3/8/2p5/8/4P3/2N5/8/4K3 w - - 0 1', 'Nd5', 'mistake')).toContain('Leaves the knight on d5 where it can be won');
  });

  test('a fork the move allows names the pieces it hits, and only a new one', () => {
    const fen = 'r3k3/2q5/4N3/8/8/8/8/4K3 b - - 0 1';
    expect(reasons(fen, 'Rd8', 'blunder').filter((text) => text.startsWith('Allows a fork'))).toHaveLength(1);
    expect(reasons(fen, 'Rd8', 'best').filter((text) => text.startsWith('Allows a fork'))).toHaveLength(0);
    // The fork was already on the board: the move did not allow it.
    expect(reasons('r2r4/2q1k3/4N3/8/8/8/8/4K3 b - - 0 1', 'Kf7', 'blunder').filter((text) => text.startsWith('Allows a fork'))).toHaveLength(0);
  });
});

describe('what the move gave up and why the better one was better', () => {
  const englund = (): string => {
    const chess = new Chess();
    chess.loadPgn('1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2');
    return chess.fen();
  };
  const line = (moveSan: string, pvSan: string[] = [moveSan]) => ({ moveSan, moveUci: '', cp: 0, mateIn: null, pvSan });
  const run = (fenBefore: string, moveSan: string, quality: MoveQuality, isUserMove: boolean, best: string, reply?: string): string[] => {
    const chess = new Chess(fenBefore);
    const mover = chess.turn() === 'w' ? 'white' : 'black';
    chess.move(moveSan);
    return buildReasons({
      mover,
      fenBefore,
      fenAfter: chess.fen(),
      moveSan,
      evalBefore: { ply: 0, fen: fenBefore, depth: 0, lines: [line(best)] },
      evalAfter: reply ? { ply: 1, fen: chess.fen(), depth: 0, lines: [line(reply)] } : undefined,
      quality,
      isUserMove,
      isBookMove: false
    });
  };

  test('the better move keeps a piece safe: on the user\'s mistakes only', () => {
    expect(run(englund(), 'e3', 'blunder', true, 'Bc3').some((text) => text.startsWith('Bc3 keeps the rook on a1 safe; after it'))).toBe(true);
    expect(run(englund(), 'e3', 'good', true, 'Bc3').join(' ')).not.toContain('keeps the rook');
    expect(run(englund(), 'e3', 'blunder', false, 'Bc3').join(' ')).not.toContain('keeps the rook');
  });

  test('a stopped guard is named against the reply, on the user\'s mistakes only', () => {
    const chess = new Chess();
    chess.loadPgn('1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2 6. Bc3 Bb4 7. Qd2 Bxc3');
    const fen = chess.fen();
    expect(run(fen, 'Qxc3', 'blunder', true, 'Nxc3', 'Qc1#')).toContain('Your queen stopped guarding c1, where Qc1# followed');
    expect(run(fen, 'Qxc3', 'inaccuracy', true, 'Nxc3', 'Qc1#').join(' ')).not.toContain('stopped guarding');
    expect(run(fen, 'Qxc3', 'blunder', false, 'Nxc3', 'Qc1#').join(' ')).not.toContain('stopped guarding');
  });
});

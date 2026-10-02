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

describe('a missed mate (Task 125.6: a count only when the search can stand behind it)', () => {
  /** Ra7 Kg8 Rb8# is mate in 2; Kf2 is played instead. */
  const LADDER_FEN = '7k/8/8/8/8/8/R7/1R4K1 w - - 0 1';
  const missed = (mateIn: number): string[] => {
    const chess = new Chess(LADDER_FEN);
    chess.move('Kf2');
    const evalBefore: EngineEval = { ply: 0, fen: LADDER_FEN, depth: 12, lines: [{ moveSan: 'Ra7', moveUci: 'a2a7', cp: null, mateIn }] };
    return buildReasons({ mover: 'white', fenBefore: LADDER_FEN, fenAfter: chess.fen(), moveSan: 'Kf2', evalBefore, quality: 'miss', isBookMove: false });
  };

  test('a short one says in how many moves', () => {
    const [note] = missed(2);
    expect(note).toContain('Ra7');
    expect(note?.replace('Ra7', '')).toMatch(/\b2\b/);
  });

  test('a long one names the move and no number', () => {
    const [note] = missed(9);
    expect(note).toContain('Ra7');
    expect(note).toMatch(/mate/);
    expect(note?.replace('Ra7', '')).not.toMatch(/\d/);
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

describe('a missed capture (Task 126.6: only when the engine\'s own line keeps the material)', () => {
  const missed = (fenBefore: string, moveSan: string, pvSan: string[] | undefined): string[] => {
    const chess = new Chess(fenBefore);
    const mover = chess.turn() === 'w' ? 'white' : 'black';
    chess.move(moveSan);
    const evalBefore: EngineEval = { ply: 0, fen: fenBefore, depth: 12, lines: [{ moveSan: pvSan?.[0] ?? '', moveUci: '', cp: 0, mateIn: null, pvSan }] };
    return buildReasons({ mover, fenBefore, fenAfter: chess.fen(), moveSan, evalBefore, quality: 'good', isBookMove: false }).filter((text) => text.startsWith('Missed'));
  };
  /** A knight on d5 nobody defends, with the rook on d1 looking at it. */
  const LOOSE_KNIGHT = '4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1';

  test('a piece left to be taken for nothing is named', () => {
    expect(missed(LOOSE_KNIGHT, 'Kf2', ['Rxd5', 'Ke7'])).toEqual(['Missed Rxd5, winning material on d5']);
  });

  test('a knight for a bishop wins nothing', () => {
    // Nxd5 cxd5: ten points up on `see.ts`'s scale, an even trade on the board.
    expect(missed('4k3/8/2p5/3b4/8/2N5/8/4K3 w - - 0 1', 'Kf2', ['Nxd5', 'cxd5', 'Ke2'])).toEqual([]);
  });

  test('a capture the engine\'s own line gives back wins nothing (the Opera game, 13…Rxd7)', () => {
    // …Nxd7 takes a rook, and Bxe7 takes the queen: Black comes out a point down.
    const opera = '3rkb1r/p2Rqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2K4R b k - 0 13';
    expect(missed(opera, 'Rxd7', ['Nxd7', 'Bxe7', 'Bxe7', 'Bxd7+', 'Rxd7', 'Qb8+', 'Bd8', 'Qxe5+'])).toEqual([]);
  });

  test('a pawn given back many moves later does not undo it', () => {
    expect(missed(LOOSE_KNIGHT, 'Kf2', ['Rxd5', 'Ke7', 'Rd1', 'Ke6', 'Kf2'])).toEqual(['Missed Rxd5, winning material on d5']);
  });
});

describe('the pin a move makes (Task 126.2)', () => {
  const BEFORE_BG5 = 'rnbqkb1r/ppp2ppp/5n2/3pp3/4P3/3P1P2/PPP3PP/RNBQKBNR w KQkq - 0 4';

  test('is said on a quiet move', () => {
    expect(reasons(BEFORE_BG5, 'Bg5', 'good')).toContain('Pins the knight on f6 to the queen');
    expect(reasons(BEFORE_BG5, 'Bg5', 'best')).toContain('Pins the knight on f6 to the queen');
  });

  test('is not said on a move that cost something: the fault is the story', () => {
    expect(reasons(BEFORE_BG5, 'Bg5', 'inaccuracy').join(' ')).not.toContain('Pins');
    expect(reasons(BEFORE_BG5, 'Bg5', 'mistake').join(' ')).not.toContain('Pins');
    expect(reasons(BEFORE_BG5, 'Bg5', 'blunder').join(' ')).not.toContain('Pins');
  });
});

describe('the piece a pawn kicks (Task 126.3)', () => {
  const AFTER_BG5 = 'rnbqkb1r/ppp2ppp/5n2/3pp1B1/4P3/3P1P2/PPP3PP/RN1QKBNR b KQkq - 1 4';
  const KICK = 'Attacks the bishop on g5, which pins the knight on f6';

  test('is said on a quiet move, not on one that cost something', () => {
    expect(reasons(AFTER_BG5, 'h6', 'best')).toContain(KICK);
    expect(reasons(AFTER_BG5, 'h6', 'inaccuracy')).not.toContain(KICK);
    expect(reasons(AFTER_BG5, 'h6', 'blunder')).not.toContain(KICK);
  });
});

describe('the one move that works (Tasks 121.3 and 125.5)', () => {
  const QUEEN_ATTACKED = '4k3/8/8/8/q7/8/5PPP/R5K1 b - - 0 1';
  const lines = [
    { moveSan: 'Qd4', moveUci: '', cp: -600, mateIn: null, pvSan: ['Qd4', 'h3'] },
    { moveSan: 'Kd7', moveUci: '', cp: 500, mateIn: null, pvSan: ['Kd7', 'Rxa4', 'Kc6'] }
  ];
  const notes = (moveSan: string, quality: MoveQuality, isRecapture = false): string[] => {
    const chess = new Chess(QUEEN_ATTACKED);
    chess.move(moveSan);
    return buildReasons({ mover: 'black', fenBefore: QUEEN_ATTACKED, fenAfter: chess.fen(), moveSan, evalBefore: { ply: 0, fen: QUEEN_ATTACKED, depth: 12, lines }, quality, isRecapture, isBookMove: false });
  };

  test('is said on the move that found it and on the move that missed it', () => {
    expect(notes('Qd4', 'best')).toContain('The only winning move: the next best, Kd7, loses the queen');
    expect(notes('Kd7', 'blunder')).toContain('Missed the only winning move, Qd4');
  });

  test('is not said on a recapture', () => {
    expect(notes('Qd4', 'best', true).join(' ')).not.toContain('only');
  });
});

describe('a note a tactic card may replace only fills a free slot', () => {
  const fen = '4k3/8/8/8/q7/8/5PPP/R5K1 b - - 0 1';
  const lines = [
    { moveSan: 'Qd4', moveUci: '', cp: -600, mateIn: null, pvSan: ['Qd4', 'h3'] },
    { moveSan: 'Kd7', moveUci: '', cp: 500, mateIn: null, pvSan: ['Kd7', 'Rxa4', 'Kc6'] }
  ];
  const notes = (moveSan: string, quality: MoveQuality): string[] => {
    const chess = new Chess(fen);
    chess.move(moveSan);
    return buildReasons({ mover: 'black', fenBefore: fen, fenAfter: chess.fen(), moveSan, evalBefore: { ply: 0, fen, depth: 12, lines }, quality, isBookMove: false });
  };

  test('with no other reason it is the note', () => {
    expect(notes('Qd4', 'best')).toEqual(['The only winning move: the next best, Kd7, loses the queen']);
  });

  test('on the move that missed it, it stands in for the mobility note', () => {
    expect(notes('Kd7', 'blunder')).toEqual(['Missed the only winning move, Qd4']);
  });
});

describe('the mobility note counts the mover\'s own moves (judges, 2026-10-02)', () => {
  // The feature delta is the mover's legal moves before minus the opponent's
  // after: "Costs 22 squares" was 51 Black moves against 29 White ones.
  const mobility = (fenBefore: string, moveSan: string, delta: number): string[] => {
    const chess = new Chess(fenBefore);
    const mover = chess.turn() === 'w' ? 'white' : 'black';
    chess.move(moveSan);
    return buildReasons({ mover, fenBefore, fenAfter: chess.fen(), moveSan, evalBefore: { ply: 0, fen: fenBefore, depth: 0, lines: [] }, quality: 'inaccuracy', isBookMove: false, featureDelta: { newForks: [], newLoosePieces: [], mobilityDelta: delta } });
  };

  /** White has 25 legal moves with the queen on d1. */
  const OPEN = '4k3/8/8/8/8/8/PP6/3QK3 w - - 0 1';

  test('a move that shuts its own pieces in says by how much', () => {
    // On a1, behind its own pawns, the queen leaves White 12.
    expect(mobility(OPEN, 'Qa1', -30)).toEqual(['Costs 13 squares of piece mobility']);
  });

  test('silent when the mover lost nothing, whatever the stored delta says', () => {
    // Qd4 opens the queen up; the stored delta compared White's moves with Black's five king moves.
    expect(mobility(OPEN, 'Qd4', -20)).toEqual([]);
  });
});

describe('a missed mate is not held against a move that still mates (judges, 2026-10-02)', () => {
  const LADDER_FEN = '7k/8/8/8/8/8/R7/1R4K1 w - - 0 1';
  const missed = (afterMateIn: number | null): string[] => {
    const chess = new Chess(LADDER_FEN);
    chess.move('Kf2');
    const evalBefore: EngineEval = { ply: 0, fen: LADDER_FEN, depth: 12, lines: [{ moveSan: 'Ra7', moveUci: 'a2a7', cp: null, mateIn: 2 }] };
    const evalAfter: EngineEval = { ply: 1, fen: chess.fen(), depth: 12, lines: [{ moveSan: 'Kg8', moveUci: 'h8g8', cp: afterMateIn === null ? 900 : null, mateIn: afterMateIn }] };
    return buildReasons({ mover: 'white', fenBefore: LADDER_FEN, fenAfter: chess.fen(), moveSan: 'Kf2', evalBefore, evalAfter, quality: 'good', isBookMove: false }).filter((text) => text.startsWith('Missed'));
  };

  test('a slower mate is still the win: nothing was missed', () => {
    expect(missed(3)).toEqual([]);
  });

  test('no mate after the move: the mate was missed', () => {
    expect(missed(null)).toEqual(['Missed mate in 2 starting with Ra7']);
  });
});

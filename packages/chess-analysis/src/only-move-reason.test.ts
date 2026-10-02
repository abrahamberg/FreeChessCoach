import type { EngineEval } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { onlyMoveReason } from './only-move-reason.js';

const line = (moveSan: string, cp: number | null, pvSan: string[] = [moveSan], mateIn: number | null = null) => ({ moveSan, moveUci: '', cp, mateIn, pvSan });
const evalOf = (fen: string, lines: ReturnType<typeof line>[]): EngineEval => ({ ply: 0, fen, depth: 12, lines });

describe('the one move that works (Tasks 121.3 and 125.5)', () => {
  /** Black's queen on a4 is attacked by the rook on a1; only …Qb4+ keeps it with a won game. */
  const QUEEN_ATTACKED = '4k3/8/8/8/q7/8/5PPP/R5K1 b - - 0 1';

  test('the played only move says what the next best loses', () => {
    const evalBefore = evalOf(QUEEN_ATTACKED, [line('Qd4', -600, ['Qd4', 'h3']), line('Kd7', 500, ['Kd7', 'Rxa4', 'Kc6'])]);
    expect(onlyMoveReason({ fenBefore: QUEEN_ATTACKED, moveSan: 'Qd4', mover: 'black', evalBefore })).toBe('The only winning move: the next best, Kd7, loses the queen');
  });

  test('the move that missed it names it', () => {
    const evalBefore = evalOf(QUEEN_ATTACKED, [line('Qd4', -600, ['Qd4', 'h3']), line('Kd7', 500, ['Kd7', 'Rxa4', 'Kc6'])]);
    expect(onlyMoveReason({ fenBefore: QUEEN_ATTACKED, moveSan: 'Kd7', mover: 'black', evalBefore })).toBe('Missed the only winning move, Qd4');
  });

  test('a queen that goes for a rook and a pawn is not "loses the queen" (34.Qd1 in Ghlbfpc6)', () => {
    const fen = 'r5k1/5ppp/1p6/2p2P1q/P2p1P2/1P1N3P/3Qr3/R1K3R1 w - - 5 34';
    const evalBefore = evalOf(fen, [line('Qd1', 112, ['Qd1', 'Qh4']), line('f6', -284, ['f6', 'Rxd2', 'Rxg7+', 'Kh8', 'Kxd2', 'Qf5'])]);
    expect(onlyMoveReason({ fenBefore: fen, moveSan: 'Qd1', mover: 'white', evalBefore })).toBe('The only good move');
  });

  test('holding against losing, and far apart in between', () => {
    const holds = evalOf(QUEEN_ATTACKED, [line('Qd4', 0, ['Qd4', 'h3']), line('Kd7', 600, ['Kd7', 'h3'])]);
    expect(onlyMoveReason({ fenBefore: QUEEN_ATTACKED, moveSan: 'Qd4', mover: 'black', evalBefore: holds })).toBe('The only move that holds');
    const apart = evalOf(QUEEN_ATTACKED, [line('Qd4', -200, ['Qd4', 'h3']), line('Kd7', 100, ['Kd7', 'h3'])]);
    expect(onlyMoveReason({ fenBefore: QUEEN_ATTACKED, moveSan: 'Qd4', mover: 'black', evalBefore: apart })).toBe('The only good move');
  });

  test('silent when the game is decided either way', () => {
    // 12.0 against 5.0: the second move still wins.
    const bothWin = evalOf(QUEEN_ATTACKED, [line('Qd4', -1200, ['Qd4', 'h3']), line('Kd7', -500, ['Kd7', 'h3'])]);
    expect(onlyMoveReason({ fenBefore: QUEEN_ATTACKED, moveSan: 'Qd4', mover: 'black', evalBefore: bothWin })).toBeNull();
    // Lost with every move: there is no good one to name.
    const bothLose = evalOf(QUEEN_ATTACKED, [line('Qd4', 500, ['Qd4', 'h3']), line('Kd7', 1200, ['Kd7', 'h3'])]);
    expect(onlyMoveReason({ fenBefore: QUEEN_ATTACKED, moveSan: 'Qd4', mover: 'black', evalBefore: bothLose })).toBeNull();
  });

  test('a next best that gets mated says so', () => {
    const evalBefore = evalOf(QUEEN_ATTACKED, [line('Qd4', -600, ['Qd4', 'h3']), line('Kd7', null, ['Kd7', 'Ra7+'], 3)]);
    expect(onlyMoveReason({ fenBefore: QUEEN_ATTACKED, moveSan: 'Qd4', mover: 'black', evalBefore })).toBe('The only winning move: the next best, Kd7, gets mated');
  });

  test('silent when a second move is close, when there is one line, and on a mate', () => {
    const close = evalOf(QUEEN_ATTACKED, [line('Qd4', -600), line('Qb4', -550)]);
    expect(onlyMoveReason({ fenBefore: QUEEN_ATTACKED, moveSan: 'Qd4', mover: 'black', evalBefore: close })).toBeNull();
    expect(onlyMoveReason({ fenBefore: QUEEN_ATTACKED, moveSan: 'Qd4', mover: 'black', evalBefore: evalOf(QUEEN_ATTACKED, [line('Qd4', -600)]) })).toBeNull();
    const mate = evalOf(QUEEN_ATTACKED, [line('Qd1+', null, ['Qd1+'], -2), line('Kd7', 500)]);
    expect(onlyMoveReason({ fenBefore: QUEEN_ATTACKED, moveSan: 'Qd1+', mover: 'black', evalBefore: mate })).toBeNull();
  });
});

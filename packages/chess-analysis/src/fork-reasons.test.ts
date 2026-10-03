import type { EngineEval, MoveQuality } from '@freechesscoach/shared';
import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { buildReasons } from './move-reasons.js';

/** Dany_Abr–TonyCorry, cut down: the knight on d4 forks the king on g1 and
 * the queen on f4 from e2. */
const BEFORE_QF4 = '4k3/8/8/8/3n4/5Q2/8/6K1 w - - 0 1';
const AFTER_QF4 = '4k3/8/8/8/3n1Q2/8/8/6K1 b - - 1 1';
const AFTER_KH1 = '4k3/8/8/8/5Q2/8/4n3/7K b - - 3 2';

const line = (moveSan: string, extra: Partial<EngineEval['lines'][number]> = {}): EngineEval['lines'][number] => ({ moveSan, moveUci: '', cp: 0, mateIn: null, ...extra });

function reasons(fenBefore: string, moveSan: string, quality: MoveQuality, best: string | null, reply: string | null, bestScore: Partial<EngineEval['lines'][number]> = {}): string[] {
  const chess = new Chess(fenBefore);
  const mover = chess.turn() === 'w' ? 'white' : 'black';
  chess.move(moveSan);
  const evalBefore: EngineEval = { ply: 0, fen: fenBefore, depth: 12, lines: best ? [line(best, bestScore)] : [] };
  const evalAfter: EngineEval = { ply: 1, fen: chess.fen(), depth: 12, lines: reply ? [line(reply)] : [] };
  return buildReasons({ mover, fenBefore, fenAfter: chess.fen(), moveSan, evalBefore, evalAfter, quality, isBookMove: false });
}

describe('the fork that turned the game (Dany_Abr–TonyCorry, 2026-10-03)', () => {
  test('the move that walks into it names the fork, not only the guard it gave up', () => {
    const notes = reasons(BEFORE_QF4, 'Qf4', 'blunder', 'Qd3', 'Ne2+');
    expect(notes[0]).toMatch(/^Allows Ne2\+, forking the king on g1 and the queen on f4/);
    expect(reasons(BEFORE_QF4, 'Qf4', 'best', 'Qf4', 'Ne2+').some((text) => text.startsWith('Allows'))).toBe(false);
  });

  test('the move that passes it up names it', () => {
    expect(reasons(AFTER_QF4, 'Kd7', 'inaccuracy', 'Ne2+', null)).toContain('Missed Ne2+, forking the king on g1 and the queen on f4');
  });

  test('the move that plays it says so, and so does the capture that cashes it in', () => {
    expect(reasons(AFTER_QF4, 'Ne2+', 'best', 'Ne2+', 'Kh1')).toContain('Forks the king on g1 and the queen on f4');
    expect(reasons(AFTER_KH1, 'Nxf4', 'best', 'Nxf4', null)).toContain('Wins the queen on f4');
  });

  test('a queen taken for the bishop that took it is still won', () => {
    expect(reasons('4k3/4q3/8/8/1B6/8/8/7K w - - 0 1', 'Bxe7', 'best', 'Bxe7', 'Kxe7')).toContain('Wins the queen for the bishop on e7');
    // A minor piece for a pawn is material won back far more often than won.
    expect(reasons('4k3/8/2p5/3b4/4P3/8/8/7K w - - 0 1', 'exd5', 'best', 'exd5', 'cxd5').some((text) => text.startsWith('Wins'))).toBe(false);
  });
});

describe('a stalemate is the whole note', () => {
  test('the won game thrown away says so, and nothing else', () => {
    // …Qb3 stalemates the king on a1; …Qb2# mated.
    const notes = reasons('8/8/8/8/1q6/8/2k5/K7 b - - 0 1', 'Qb3', 'blunder', 'Qb2#', null, { cp: null, mateIn: -1 });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/^Stalemate: .*thrown away/);
  });
});

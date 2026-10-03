import { describe, expect, it } from 'vitest';
import type { EngineEval } from '@freechesscoach/shared';
import { principleReason } from './principle-reasons.js';

const evaluation = (fen: string, moveSan: string, pvSan: string[]): EngineEval => ({ fen, ply: 0, depth: 12, lines: [{ moveSan, moveUci: '', cp: 0, mateIn: null, pvSan }] });

describe('principleReason', () => {
  it('names a development with check on a good move', () => {
    const fen = 'r1bqkbnr/2pp1pp1/p1n4p/1p1B4/3PP3/5N2/PP3PPP/RNBQK2R b KQkq - 1 7';
    expect(principleReason({ fenBefore: fen, moveSan: 'Bb4+', quality: 'best', evalBefore: evaluation(fen, 'Bb4+', ['Bb4+']) })).toBe('Develops the bishop with check');
  });

  it('says a trade that helps the opponent develop, against the engine move that develops', () => {
    const fen = 'r1bqk1nr/2pp1pp1/p1n4p/1p1B4/1b1PP3/8/PP1N1PPP/RNBQK2R b KQkq - 3 8';
    const text = principleReason({
      fenBefore: fen,
      moveSan: 'Bxd2+',
      quality: 'inaccuracy',
      evalBefore: evaluation(fen, 'Nge7', ['Nge7', 'a3']),
      evalAfter: evaluation(fen, 'Nxd2', ['Nxd2', 'Nge7'])
    });
    expect(text).toBe('Bxd2+ trades off a developed bishop and lets White bring out a knight with Nxd2; Nge7 develops the knight and attacks the bishop on d5');
  });

  it('flags the queen out while a knight is still at home', () => {
    const fen = 'r2qk1nr/1bpp1pp1/p1n4p/1p1B4/3PP3/8/PP1B1PPP/RN1QK2R w KQkq - 1 10';
    expect(principleReason({ fenBefore: fen, moveSan: 'Qf3', quality: 'inaccuracy', evalBefore: evaluation(fen, 'Nc3', ['Nc3']) })).toBe('Nc3 was better: it develops the knight, which the early Qf3 puts off');
  });

  it('does not call a one-step queen move early', () => {
    const fen = 'r2qk1nr/1bpp1pp1/p1n4p/1p1B4/3PP3/5Q2/PP1B1PPP/RN2K2R b KQkq - 2 10';
    expect(principleReason({ fenBefore: fen, moveSan: 'Qe7', quality: 'inaccuracy', evalBefore: evaluation(fen, 'Nf6', ['Nf6']) })).toBe('Nf6 was better: it develops the knight and attacks the bishop on d5');
  });

  it('stays silent on book moves and when the best move is the played one', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    expect(principleReason({ fenBefore: fen, moveSan: 'Bc4', quality: 'book', evalBefore: evaluation(fen, 'Bb5', ['Bb5']) })).toBeNull();
    expect(principleReason({ fenBefore: fen, moveSan: 'Bb5', quality: 'inaccuracy', evalBefore: evaluation(fen, 'Bb5', ['Bb5']) })).toBeNull();
  });
});

describe('principleReason guards', () => {
  it('does not call a piece chased when the reply does not attack it', () => {
    const fen = 'rnbqk2r/pp2nppp/2pb4/3p4/3P4/3B1N2/PPP2PPP/RNBQ1RK1 w kq - 4 7';
    const text = principleReason({
      fenBefore: fen,
      moveSan: 'Ng5',
      quality: 'inaccuracy',
      evalBefore: evaluation(fen, 'Re1', ['Re1']),
      evalAfter: evaluation(fen, 'Bf5', ['Bf5', 'Nf3', 'Bxd3', 'Qxd3'])
    });
    expect(text ?? '').not.toContain('chased');
  });

  it('keeps the opening advice out of the middlegame', () => {
    const fen = 'r4r2/5kpp/p1n1pp2/1p1p3P/3P1N2/P1P5/1P3PP1/R3K2R w KQ - 1 22';
    expect(principleReason({ fenBefore: fen, moveSan: 'Kd2', quality: 'inaccuracy', evalBefore: evaluation(fen, 'O-O-O', ['O-O-O']) })).toBeNull();
  });
});

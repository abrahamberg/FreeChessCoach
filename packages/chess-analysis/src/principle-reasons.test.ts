import { describe, expect, it } from 'vitest';
import type { EngineEval } from '@freechesscoach/shared';
import { givesUpCastlingText, principleReason, strongerCandidatesText } from './principle-reasons.js';

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

describe('outposts and stronger candidates', () => {
  it('calls a knight no pawn can attack an outpost, and names what it hits', () => {
    const fen = 'r3k1nr/1bppqpp1/p1n4p/1p1B4/3PP3/5Q2/PP1B1PPP/RN3RK1 b kq - 4 11';
    expect(principleReason({ fenBefore: fen, moveSan: 'Nxd4', quality: 'best', evalBefore: evaluation(fen, 'Nxd4', ['Nxd4']) })).toBe(
      'Puts the knight on an outpost on d4, where no pawn can attack it, and attacks the queen on f3'
    );
  });

  it('is no outpost while an enemy pawn can still come and attack it', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    expect(principleReason({ fenBefore: fen, moveSan: 'Nxe5', quality: 'best', evalBefore: evaluation(fen, 'Nxe5', ['Nxe5']) })).toBeNull();
  });

  it('lists the stronger moves a fine one passed over, each with what it does', () => {
    const fen = 'r3k1nr/2ppBpp1/p6p/1p1b4/4Pn2/8/PP3PPP/RN3R1K b kq - 0 15';
    const line = (moveSan: string, cp: number) => ({ moveSan, moveUci: '', cp, mateIn: null, pvSan: [moveSan] });
    const evalBefore: EngineEval = { fen, ply: 0, depth: 12, lines: [line('Bxe4', -606), line('Bc4', -589), line('Nxe7', -587)] };
    const evalAfter: EngineEval = { fen, ply: 1, depth: 12, lines: [line('exd5', -556)] };
    expect(strongerCandidatesText({ fenBefore: fen, moveSan: 'Kxe7', quality: 'good', evalBefore, evalAfter })).toBe(
      'Bxe4 (takes the pawn on e4 and attacks the knight on b1), Bc4 (attacks the rook on f1) and Nxe7 (takes the bishop on e7 and develops the knight) were stronger than Kxe7'
    );
  });

  it('keeps the single "Missed" note when only one move was stronger', () => {
    const fen = 'r3k1nr/2ppBpp1/p6p/1p1b4/4Pn2/8/PP3PPP/RN3R1K b kq - 0 15';
    const line = (moveSan: string, cp: number) => ({ moveSan, moveUci: '', cp, mateIn: null, pvSan: [moveSan] });
    const evalBefore: EngineEval = { fen, ply: 0, depth: 12, lines: [line('Bxe4', -606), line('Nxe7', -550)] };
    const evalAfter: EngineEval = { fen, ply: 1, depth: 12, lines: [line('exd5', -556)] };
    expect(strongerCandidatesText({ fenBefore: fen, moveSan: 'Kxe7', quality: 'good', evalBefore, evalAfter })).toBeNull();
  });
});

describe('givesUpCastlingText', () => {
  const fen = 'r3k1nr/2ppBpp1/p6p/1p1b4/4Pn2/8/PP3PPP/RN3R1K b kq - 0 15';
  it('says a king capture costs castling, with the queens off the board too', () => {
    expect(givesUpCastlingText({ fenBefore: fen, moveSan: 'Kxe7', quality: 'good', evalBefore: evaluation(fen, 'Bxe4', ['Bxe4']) })).toBe('Kxe7 gives up castling for good');
  });
  it('is silent when castling was already gone or the move is a castle', () => {
    const gone = 'r3k1nr/2ppBpp1/p6p/1p1b4/4Pn2/8/PP3PPP/RN3R1K b - - 0 15';
    expect(givesUpCastlingText({ fenBefore: gone, moveSan: 'Kxe7', quality: 'good', evalBefore: evaluation(gone, 'Bxe4', ['Bxe4']) })).toBeNull();
  });
});

describe('castle comments', () => {
  it('names opposite-side castling and the open d-file', () => {
    const fen = 'r4rk1/pp3ppp/2np1n2/q7/8/2N1B3/PPP1QPPP/R3KB1R w KQ - 0 9';
    const text = principleReason({ fenBefore: fen, moveSan: 'O-O-O', quality: 'good', evalBefore: evaluation(fen, 'O-O-O', ['O-O-O']) });
    expect(text).toContain('Castles queenside');
    expect(text).toContain('half-open d-file');
    expect(text).toContain('storm');
  });
  it('stays silent on kingside castling, which has nothing game-specific to say', () => {
    const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 6 5';
    expect(principleReason({ fenBefore: fen, moveSan: 'O-O', quality: 'best', evalBefore: evaluation(fen, 'O-O', ['O-O']) })).toBeNull();
  });
});

describe('stronger candidates without a capture or attack', () => {
  it('says when a candidate castles or takes an open file', () => {
    const fen = 'r4rk1/pp3ppp/2np1n2/q7/8/2N1B3/PPP1QPPP/R3KB1R w KQ - 0 9';
    const lines = ['O-O-O', 'Rd1'].map((moveSan) => ({ moveSan, cp: 80, mateIn: null, pvSan: [moveSan] }));
    const text = strongerCandidatesText({
      fenBefore: fen,
      moveSan: 'a3',
      quality: 'good',
      evalBefore: { ...evaluation(fen, 'O-O-O', ['O-O-O']), lines } as never,
      evalAfter: { lines: [{ moveSan: 'x', cp: 0, mateIn: null, pvSan: [] }] } as never
    });
    expect(text).toContain('O-O-O (castles)');
  });
});

import { describe, expect, test } from 'vitest';
import { appendMoveToPgn, formatEvalTag, removeLastMoveFromPgn, setLastMoveEval } from './pgn-mutation.js';
import { extractPgnMoveComments } from './pgn-move-comments.js';

const EMPTY_PGN = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

*`;

const ONE_MOVE_PGN = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 *`;

const TWO_MOVE_PGN = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 e5 *`;

const CHECKMATE_PGN = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

describe('appendMoveToPgn', () => {
  test('applies a legal move to an empty (header-only) PGN', () => {
    const result = appendMoveToPgn(EMPTY_PGN, 'e4');

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.san).toBe('e4');
    expect(result.uci).toBe('e2e4');
    expect(result.ply).toBe(1);
    expect(result.fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(result.pgn).toContain('1. e4');
  });

  test('applies a legal move to a PGN that already has moves, incrementing ply', () => {
    const result = appendMoveToPgn(ONE_MOVE_PGN, 'e5');

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.san).toBe('e5');
    expect(result.uci).toBe('e7e5');
    expect(result.ply).toBe(2);
    expect(result.pgn).toContain('1. e4 e5');
  });

  test('preserves existing White/Black/Result headers across an append', () => {
    const result = appendMoveToPgn(ONE_MOVE_PGN, 'e5');

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.pgn).toContain('[White "Alice"]');
    expect(result.pgn).toContain('[Black "Bob"]');
    expect(result.pgn).toContain('[Result "*"]');
  });

  test('an illegal SAN returns an error and does not mutate the position', () => {
    const result = appendMoveToPgn(EMPTY_PGN, 'Zz9');

    expect(result).toEqual({ error: 'Illegal move: Zz9' });
  });

  test('an illegal SAN on a PGN with existing moves leaves that PGN reproducible unchanged (error, no partial move)', () => {
    const result = appendMoveToPgn(ONE_MOVE_PGN, 'Zz9');

    expect(result).toEqual({ error: 'Illegal move: Zz9' });
  });

  test('with no options, behaves identically to before (no clock comment)', () => {
    const result = appendMoveToPgn(EMPTY_PGN, 'e4');

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.pgn).not.toContain('%clk');
  });

  test('passing elapsedMs embeds a standard {[%clk h:mm:ss]} comment after the move', () => {
    const result = appendMoveToPgn(EMPTY_PGN, 'e4', { elapsedMs: 83_000 });

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.pgn).toContain('1. e4 {[%clk 0:01:23]}');
  });

  test('elapsedMs of exactly one hour formats the hours component unpadded', () => {
    const result = appendMoveToPgn(EMPTY_PGN, 'e4', { elapsedMs: 3_600_000 });

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.pgn).toContain('{[%clk 1:00:00]}');
  });
});

describe('removeLastMoveFromPgn', () => {
  test('undoes the only move in a 1-move PGN back to the starting position', () => {
    const result = removeLastMoveFromPgn(ONE_MOVE_PGN);

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  test('undoing then appending a different move genuinely rewinds the position, not just cosmetically', () => {
    const undone = removeLastMoveFromPgn(TWO_MOVE_PGN);
    expect('error' in undone).toBe(false);
    if ('error' in undone) return;

    const reappended = appendMoveToPgn(undone.pgn, 'c5');
    expect('error' in reappended).toBe(false);
    if ('error' in reappended) return;
    expect(reappended.san).toBe('c5');
    expect(reappended.fen).toBe('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  });

  test('returns an error when there is no move to undo', () => {
    const result = removeLastMoveFromPgn(EMPTY_PGN);

    expect(result).toEqual({ error: 'no move to undo' });
  });

  test('undoes the final move of a checkmate-ending PGN', () => {
    const result = removeLastMoveFromPgn(CHECKMATE_PGN);

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.fen).toBe('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
  });
});

describe('saving the eval with a move', () => {
  test('formats pawns for a score and #N for a mate, White-perspective', () => {
    expect(formatEvalTag({ cp: 25, mateIn: null })).toBe('[%eval 0.25]');
    expect(formatEvalTag({ cp: -130, mateIn: null })).toBe('[%eval -1.30]');
    expect(formatEvalTag({ cp: null, mateIn: 3 })).toBe('[%eval #3]');
    expect(formatEvalTag({ cp: null, mateIn: -2 })).toBe('[%eval #-2]');
  });

  test('a move appended with an eval reads back through the existing [%eval] reader, next to its clock', () => {
    const result = appendMoveToPgn(EMPTY_PGN, 'e4', { elapsedMs: 5000, evalAfter: { cp: 32, mateIn: null } });
    if ('error' in result) throw new Error(result.error);

    expect(extractPgnMoveComments(result.pgn)).toEqual([{ ply: 1, clockMs: 5000, evalCp: 32, timeSpentMs: null }]);
  });

  test('setLastMoveEval adds an eval to a move saved without one, keeping its clock', () => {
    const saved = appendMoveToPgn(EMPTY_PGN, 'e4', { elapsedMs: 5000 });
    if ('error' in saved) throw new Error(saved.error);

    const result = setLastMoveEval(saved.pgn, 'e4', { cp: 20, mateIn: null });
    if ('error' in result) throw new Error(result.error);

    expect(extractPgnMoveComments(result.pgn)).toEqual([{ ply: 1, clockMs: 5000, evalCp: 20, timeSpentMs: null }]);
  });

  test('setLastMoveEval replaces an earlier eval instead of stacking a second tag', () => {
    const saved = appendMoveToPgn(EMPTY_PGN, 'e4', { evalAfter: { cp: 10, mateIn: null } });
    if ('error' in saved) throw new Error(saved.error);

    const result = setLastMoveEval(saved.pgn, 'e4', { cp: 40, mateIn: null });
    if ('error' in result) throw new Error(result.error);

    expect(result.pgn.match(/\[%eval/g)).toHaveLength(1);
    expect(extractPgnMoveComments(result.pgn)[0]?.evalCp).toBe(40);
  });

  test('setLastMoveEval refuses when the last move is not the one the caller expects', () => {
    const saved = appendMoveToPgn(EMPTY_PGN, 'e4');
    if ('error' in saved) throw new Error(saved.error);

    expect(setLastMoveEval(saved.pgn, 'd4', { cp: 0, mateIn: null })).toEqual({ error: 'Last move is e4, not d4' });
    expect(setLastMoveEval(EMPTY_PGN, 'e4', { cp: 0, mateIn: null })).toEqual({ error: 'No moves to evaluate' });
  });

  test('undoing a move leaves the earlier moves\' evals in place', () => {
    const first = appendMoveToPgn(EMPTY_PGN, 'e4', { evalAfter: { cp: 30, mateIn: null } });
    if ('error' in first) throw new Error(first.error);
    const second = appendMoveToPgn(first.pgn, 'e5', { evalAfter: { cp: 10, mateIn: null } });
    if ('error' in second) throw new Error(second.error);

    const undone = removeLastMoveFromPgn(second.pgn);
    if ('error' in undone) throw new Error(undone.error);

    expect(extractPgnMoveComments(undone.pgn).map((comment) => [comment.ply, comment.evalCp])).toEqual([[1, 30]]);
  });
});

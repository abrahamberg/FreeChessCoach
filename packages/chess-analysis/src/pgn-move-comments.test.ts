import { describe, expect, test } from 'vitest';
import { extractPgnMoveComments } from './pgn-move-comments.js';

const NO_COMMENTS_PGN = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

// Mirrors pgn.test.ts's LICHESS_ANNOTATED_PGN fixture exactly (the same
// real Lichess export), reused here so both parsers are exercised against
// the same ground truth.
const LICHESS_ANNOTATED_PGN = `[Event "rated rapid game"]
[Site "https://lichess.org/zFCbLgLe"]
[Date "2026.08.12"]
[White "Badrkhan0007"]
[Black "skyraider82"]
[Result "1-0"]
[Variant "Standard"]

1. Nc3 { [%eval -0.04] [%clk 0:10:00] } 1... e5 { [%eval 0.2] [%clk 0:10:00] }
2. e4 { [%eval 0.08] [%clk 0:09:59] } 2... Nf6 { [%eval 0.03] [%clk 0:09:57] }
3. Bc4 { [%eval 0.0] [%clk 0:09:57] } { C26 Vienna Game: Stanley Variation } 3... d6 { [%eval 0.22] [%clk 0:09:38] }
4. a3?! { (0.22 → -0.39) Inaccuracy. Nf3 was best. } { [%eval -0.39] [%clk 0:09:56] }
(4. Nf3 Be7 5. d4 exd4 6. Nxd4 O-O 7. O-O c6 8. a4 d5)
4... Bg4?! { (-0.39 → 0.26) Inaccuracy. Nxe4 was best. } { [%eval 0.26] [%clk 0:09:34] } *`;

const SPARSE_PGN = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 { [%clk 0:10:00] } e5 2. Nf3 Nc6 *`;

const FRACTIONAL_CLOCK_PGN = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 { [%clk 0:00:10.5] } e5 { [%clk 0:00:09.25] } *`;

const MATE_EVAL_PGN = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 { [%eval #3] } e5 { [%eval #-2] } *`;

const LEADING_COMMENT_PGN = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

{ A comment before the first move } 1. e4 { [%clk 0:10:00] } e5 *`;

const INCREMENT_PGN = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "*"]
[TimeControl "600+2"]

1. e4 { [%clk 0:09:55] } e5 { [%clk 0:09:50] } 2. Nf3 { [%clk 0:09:48] } *`;

describe('extractPgnMoveComments', () => {
  test('a PGN with no comments at all yields an empty array', () => {
    expect(extractPgnMoveComments(NO_COMMENTS_PGN)).toEqual([]);
  });

  test('extracts ply-indexed clock and eval data from a real Lichess export', () => {
    const comments = extractPgnMoveComments(LICHESS_ANNOTATED_PGN);

    expect(comments).toEqual([
      { ply: 1, clockMs: 600000, evalCp: -4, timeSpentMs: null },
      { ply: 2, clockMs: 600000, evalCp: 20, timeSpentMs: null },
      { ply: 3, clockMs: 599000, evalCp: 8, timeSpentMs: 1000 },
      { ply: 4, clockMs: 597000, evalCp: 3, timeSpentMs: 3000 },
      { ply: 5, clockMs: 597000, evalCp: 0, timeSpentMs: 2000 },
      { ply: 6, clockMs: 578000, evalCp: 22, timeSpentMs: 19000 },
      { ply: 7, clockMs: 596000, evalCp: -39, timeSpentMs: 1000 },
      { ply: 8, clockMs: 574000, evalCp: 26, timeSpentMs: 4000 }
    ]);
  });

  test('a variation\'s comments are never attributed to the mainline', () => {
    const comments = extractPgnMoveComments(LICHESS_ANNOTATED_PGN);
    // The RAV "(4. Nf3 Be7 5. d4 exd4 ...)" between plies 7 and 8 carries no
    // comments of its own here, but its move tokens must not shift ply 8's
    // numbering — asserted above by ply 8 being Bg4, not some other move.
    expect(comments.find((c) => c.ply === 8)?.evalCp).toBe(26);
  });

  test('is sparse: a move with no comment has no entry, never a guessed default', () => {
    const comments = extractPgnMoveComments(SPARSE_PGN);
    expect(comments).toEqual([{ ply: 1, clockMs: 600000, evalCp: null, timeSpentMs: null }]);
  });

  test('parses both h:mm:ss and h:mm:ss.f clock formats', () => {
    const comments = extractPgnMoveComments(FRACTIONAL_CLOCK_PGN);
    expect(comments).toEqual([
      { ply: 1, clockMs: 10500, evalCp: null, timeSpentMs: null },
      { ply: 2, clockMs: 9250, evalCp: null, timeSpentMs: null }
    ]);
  });

  test('folds [%eval #N] mate scores using the shared mate-folding convention, sign preserved', () => {
    const comments = extractPgnMoveComments(MATE_EVAL_PGN);
    expect(comments[0]).toMatchObject({ ply: 1, evalCp: 1970 });
    expect(comments[1]).toMatchObject({ ply: 2, evalCp: -1980 });
  });

  test('a comment before the first move is dropped, not attributed to ply 0', () => {
    const comments = extractPgnMoveComments(LEADING_COMMENT_PGN);
    expect(comments).toEqual([{ ply: 1, clockMs: 600000, evalCp: null, timeSpentMs: null }]);
  });

  test('timeSpentMs adds the TimeControl increment back onto the clock delta', () => {
    const comments = extractPgnMoveComments(INCREMENT_PGN);
    // White: ply 1's clock (595s) to ply 3's (588s) is a 7s drop, plus the
    // 2s increment credited back after ply 1's move = 9s actually spent.
    expect(comments[0]).toMatchObject({ ply: 1, timeSpentMs: null });
    expect(comments[2]).toMatchObject({ ply: 3, timeSpentMs: 9000 });
  });
});

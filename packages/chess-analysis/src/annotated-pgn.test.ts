import { describe, expect, test } from 'vitest';
import {
  appendAnnotatedMove,
  buildAnnotatedPgn,
  decodeMoveComment,
  encodeMoveComment,
  parseAnnotatedPgn,
  type AnnotatedMoveData
} from './annotated-pgn.js';
import { removeLastMoveFromPgn } from './pgn-mutation.js';

const HEADERS = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

`;

const SAMPLE_DATA: AnnotatedMoveData = {
  cpLoss: 12,
  quality: 'good',
  bestLineSan: ['Nf3', 'Nc6'],
  evalAfterCp: 34,
  hangsPiece: false,
  reasons: ['Develops a piece.', 'Keeps options open.'],
  diagnosisCodes: ['MS-07']
};

describe('encodeMoveComment / decodeMoveComment', () => {
  test('round-trips a full payload', () => {
    const encoded = encodeMoveComment(SAMPLE_DATA);
    expect(decodeMoveComment(encoded)).toEqual(SAMPLE_DATA);
  });

  test('encoded tag never contains a PGN-structural character', () => {
    const encoded = encodeMoveComment(SAMPLE_DATA);
    expect(encoded).not.toMatch(/[{}]/);
    // Exactly one closing bracket — the tag's own — so a naive `[^\]]*]`
    // scanner never terminates early on the JSON payload's own `]` chars
    // (bestLineSan is an array).
    expect(encoded.match(/\]/g)).toHaveLength(1);
  });

  test('coexists with an existing [%clk] tag inside the same comment', () => {
    const combined = `[%clk 0:09:57] ${encodeMoveComment(SAMPLE_DATA)}`;
    expect(decodeMoveComment(combined)).toEqual(SAMPLE_DATA);
  });

  test('returns null for a comment with no [%fcc] tag', () => {
    expect(decodeMoveComment('[%clk 0:09:57] [%eval 0.22]')).toBeNull();
  });

  test('returns null for a garbled [%fcc] payload rather than throwing', () => {
    expect(decodeMoveComment('[%fcc not-valid-json-at-all]')).toBeNull();
  });
});

describe('appendAnnotatedMove', () => {
  test('appends a move and embeds its annotation', () => {
    const appended = appendAnnotatedMove(`${HEADERS}*`, 'e4', SAMPLE_DATA);
    if ('error' in appended) throw new Error(appended.error);
    expect(appended.san).toBe('e4');
    expect(appended.ply).toBe(1);

    const [move] = parseAnnotatedPgn(appended.pgn, 'white');
    expect(move?.moveSan).toBe('e4');
    expect(move?.cpLoss).toBe(SAMPLE_DATA.cpLoss);
    expect(move?.bestLineSan).toEqual(SAMPLE_DATA.bestLineSan);
  });

  test('a move appended with no data produces valid PGN with no [%fcc] comment', () => {
    const appended = appendAnnotatedMove(`${HEADERS}*`, 'e4', null);
    if ('error' in appended) throw new Error(appended.error);
    expect(appended.pgn).not.toContain('[%fcc');

    // parseAnnotatedPgn can't reconstruct a full ClassifiedMoveDto without a
    // decodable comment (cpLoss/quality/etc. are required fields, not
    // optional) — it drops the ply rather than fabricate one.
    expect(parseAnnotatedPgn(appended.pgn, 'white')).toEqual([]);
  });

  test('preserves an [%clk] comment alongside the annotation', () => {
    const appended = appendAnnotatedMove(`${HEADERS}*`, 'e4', SAMPLE_DATA, { elapsedMs: 61_000 });
    if ('error' in appended) throw new Error(appended.error);
    expect(appended.pgn).toContain('[%clk 0:01:01]');

    const [move] = parseAnnotatedPgn(appended.pgn, 'white');
    expect(move?.cpLoss).toBe(SAMPLE_DATA.cpLoss);
  });

  test('rejects an illegal move', () => {
    const appended = appendAnnotatedMove(`${HEADERS}*`, 'Qh8', SAMPLE_DATA);
    expect('error' in appended).toBe(true);
  });

  test('accumulates multiple annotated moves in order', () => {
    const first = appendAnnotatedMove(`${HEADERS}*`, 'e4', { ...SAMPLE_DATA, cpLoss: 0 });
    if ('error' in first) throw new Error(first.error);
    const second = appendAnnotatedMove(first.pgn, 'e5', { ...SAMPLE_DATA, cpLoss: 5 });
    if ('error' in second) throw new Error(second.error);

    const moves = parseAnnotatedPgn(second.pgn, 'white');
    expect(moves.map((move) => move.moveSan)).toEqual(['e4', 'e5']);
    expect(moves.map((move) => move.cpLoss)).toEqual([0, 5]);
  });
});

describe('undo via removeLastMoveFromPgn', () => {
  test('dropping the last move also drops its annotation — no bespoke undo needed', () => {
    const first = appendAnnotatedMove(`${HEADERS}*`, 'e4', SAMPLE_DATA);
    if ('error' in first) throw new Error(first.error);
    const second = appendAnnotatedMove(first.pgn, 'e5', { ...SAMPLE_DATA, cpLoss: 99 });
    if ('error' in second) throw new Error(second.error);

    const undone = removeLastMoveFromPgn(second.pgn);
    if ('error' in undone) throw new Error(undone.error);

    const moves = parseAnnotatedPgn(undone.pgn, 'white');
    expect(moves).toHaveLength(1);
    expect(moves[0]?.moveSan).toBe('e4');
    expect(moves[0]?.cpLoss).toBe(SAMPLE_DATA.cpLoss);
  });
});

describe('parseAnnotatedPgn', () => {
  test('reconstructs ply/moveNumber/mover/fenBefore/fenAfter from the mainline, not the comment', () => {
    const appended = appendAnnotatedMove(`${HEADERS}*`, 'e4', SAMPLE_DATA);
    if ('error' in appended) throw new Error(appended.error);

    const [move] = parseAnnotatedPgn(appended.pgn, 'white');
    expect(move?.ply).toBe(1);
    expect(move?.moveNumber).toBe(1);
    expect(move?.mover).toBe('white');
    expect(move?.fenBefore).toContain('w KQkq');
    expect(move?.fenAfter).toContain('b KQkq');
  });

  test('empty movetext yields no moves', () => {
    expect(parseAnnotatedPgn(`${HEADERS}*`, 'white')).toEqual([]);
  });
});

describe('buildAnnotatedPgn', () => {
  test('builds one annotated PGN from a plain PGN plus a per-ply data map, dropping the bare (unannotated) ply on read', () => {
    const plain = `${HEADERS}1. e4 e5 2. Nf3 *`;
    const annotated = buildAnnotatedPgn(
      plain,
      new Map([
        [1, { ...SAMPLE_DATA, cpLoss: 0 }],
        [3, { ...SAMPLE_DATA, cpLoss: 15 }]
      ])
    );

    // Ply 2 (e5) has no movesData entry, so it's written with no [%fcc]
    // comment — parseAnnotatedPgn can't reconstruct a full ClassifiedMoveDto
    // for it (cpLoss/quality/etc. are required fields) and drops it.
    const moves = parseAnnotatedPgn(annotated, 'white');
    expect(moves.map((move) => move.moveSan)).toEqual(['e4', 'Nf3']);
    expect(moves[0]?.cpLoss).toBe(0);
    expect(moves[1]?.cpLoss).toBe(15);
  });

  test('round-trips a custom starting position ([FEN]/[SetUp] headers)', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    const plain = `[Event "Test"]\n[White "Alice"]\n[Black "Bob"]\n[Result "*"]\n[FEN "${fen}"]\n[SetUp "1"]\n\n3. Bb5 *`;
    const annotated = buildAnnotatedPgn(plain, new Map([[1, SAMPLE_DATA]]));

    const moves = parseAnnotatedPgn(annotated, 'white');
    expect(moves).toHaveLength(1);
    expect(moves[0]?.moveSan).toBe('Bb5');
    expect(moves[0]?.cpLoss).toBe(SAMPLE_DATA.cpLoss);
  });

  // Regression: mover/isUserMove must come from the actual replay
  // (position.mover), not ply-parity (plyToMoveRef assumes ply 1 is always
  // White) — a custom start with Black to move is exactly the case that
  // breaks the parity assumption.
  test('derives mover from the actual replay, not ply parity, for a custom start with Black to move', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 3';
    const plain = `[Event "Test"]\n[White "Alice"]\n[Black "Bob"]\n[Result "*"]\n[FEN "${fen}"]\n[SetUp "1"]\n\n3... Nf6 4. Nc3 *`;
    const annotated = buildAnnotatedPgn(
      plain,
      new Map([
        [1, { ...SAMPLE_DATA, cpLoss: 1 }],
        [2, { ...SAMPLE_DATA, cpLoss: 2 }]
      ])
    );

    const movesAsWhite = parseAnnotatedPgn(annotated, 'white');
    expect(movesAsWhite[0]).toMatchObject({ moveSan: 'Nf6', mover: 'black', isUserMove: false });
    expect(movesAsWhite[1]).toMatchObject({ moveSan: 'Nc3', mover: 'white', isUserMove: true });

    const movesAsBlack = parseAnnotatedPgn(annotated, 'black');
    expect(movesAsBlack[0]).toMatchObject({ mover: 'black', isUserMove: true });
    expect(movesAsBlack[1]).toMatchObject({ mover: 'white', isUserMove: false });
  });
});

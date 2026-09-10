import { describe, expect, test } from 'vitest';
import { inspectMoves } from './inspect-moves.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('inspectMoves', () => {
  test('reports the position it was asked about', () => {
    const inspection = inspectMoves(START, ['e4']);

    expect(inspection.error).toBeNull();
    expect(inspection.turn).toBe('white');
    expect(inspection.boardState).toBe('none');
  });

  test('a legal move comes back normalized, with the position it reaches', () => {
    const [move] = inspectMoves(START, ['e2e4']).moves;

    expect(move).toMatchObject({ requested: 'e2e4', legal: true, san: 'e4', from: 'e2', to: 'e4', piece: 'p' });
    expect(move?.legal === true && move.resultFen.startsWith('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b')).toBe(true);
  });

  test('an illegal move is reported as illegal, with the legal moves of that piece instead', () => {
    const [move] = inspectMoves(START, ['Nf6']).moves;

    expect(move).toMatchObject({ requested: 'Nf6', legal: false });
    expect(move?.legal === false && move.alternatives).toEqual(expect.arrayContaining(['Nf3', 'Nc3']));
  });

  test('a move for a piece that is not on the board at all still comes back illegal, never as a guess', () => {
    const [move] = inspectMoves(START, ['Qh5xf7#']).moves;

    expect(move?.legal).toBe(false);
  });

  test('captures, checks and mate are named on the move that makes them', () => {
    // Scholar's mate: Qxf7 is both a capture and checkmate.
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    const [move] = inspectMoves(fen, ['Qxf7#']).moves;

    expect(move).toMatchObject({ legal: true, san: 'Qxf7#', captured: 'p', gives: 'checkmate' });
  });

  test('a move that leaves the mover hanging says so — this is the claim a coach gets wrong', () => {
    // The d5 pawn is defended by the pawn on e6, so Qxd5 is legal, wins a
    // pawn for one move, and leaves the queen hanging to exd5.
    const fen = '4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1';
    const [move] = inspectMoves(fen, ['Qxd5']).moves;

    expect(move?.legal).toBe(true);
    expect(move?.legal === true && move.leavesHanging.map((piece) => piece.square)).toContain('d5');
  });

  test('a fork the move creates is named', () => {
    // White knight to c7 forks the black king on e8 and the rook on a8.
    const fen = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';
    const inspection = inspectMoves(fen, ['Nc7+']);
    const [move] = inspection.moves;

    expect(move?.legal === true && move.createsForks.map((fork) => fork.square)).toContain('c7');
  });

  test('the position\'s own hanging pieces and favorable captures are listed once, not per move', () => {
    // Black knight on d4 is attacked by the white pawn on e3 and undefended.
    const fen = '4k3/8/8/8/3n4/4P3/8/4K3 w - - 0 1';
    const inspection = inspectMoves(fen, ['exd4']);

    expect(inspection.hangingPieces.map((piece) => piece.square)).toContain('d4');
    expect(inspection.favorableCaptures.map((capture) => capture.moveSan)).toContain('exd4');
  });

  test('an unparseable fen fails as an error, never as an invented position', () => {
    const inspection = inspectMoves('not-a-fen', ['e4']);

    expect(inspection.error).not.toBeNull();
    expect(inspection.moves).toEqual([]);
  });

  test('an empty move list still returns the position facts', () => {
    const inspection = inspectMoves(START, []);

    expect(inspection.moves).toEqual([]);
    expect(inspection.turn).toBe('white');
  });

  test('checkmate and stalemate are reported as the position\'s state', () => {
    const mate = inspectMoves('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', []);
    expect(mate.boardState).toBe('checkmate');
  });
});

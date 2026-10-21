import { describe, expect, it } from 'vitest';
import { FastBoard } from './board.js';
import { legalMoves } from './moves.js';

function perft(board: FastBoard, depth: number): number {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const move of legalMoves(board)) {
    board.make(move);
    nodes += perft(board, depth - 1);
    board.unmake();
  }
  return nodes;
}

/** The standard perft positions: castling, en passant, promotions and pins
 * each change these counts if the generator gets one wrong. */
describe('fast board move generation', () => {
  it.each([
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 3, 8902],
    ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 2, 2039],
    ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 3, 2812],
    ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 2, 264],
    ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 2, 1486]
  ])('perft of %s to depth %i', (fen, depth, nodes) => {
    expect(perft(FastBoard.fromFen(fen), depth)).toBe(nodes);
  });

  it('gives the board back as it was after make and unmake', () => {
    const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
    const board = FastBoard.fromFen(fen);
    for (const move of legalMoves(board)) {
      board.make(move);
      board.unmake();
    }
    expect(board.toFen()).toBe(fen.replace(/ 0 1$/, ' 0 1'));
  });
});

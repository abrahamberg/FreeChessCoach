import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { blocksOwnPieceText, opensOwnPieceText, pilesOnText } from './piece-coordination.js';

const FEN = '2kr3r/ppp2ppp/2bb1q2/3p1p2/3P4/2P1PN2/PPQN1PPP/R4RK1 b - - 1 12';
const play = (fen: string, san: string) => new Chess(fen).move(san);

describe('piece coordination', () => {
  it('names the bishop a pawn move cuts off, and the move that keeps it open', () => {
    const text = blocksOwnPieceText(FEN, play(FEN, 'f4'), play(FEN, 'g5'));
    expect(text).toMatch(/^f4 cuts off the bishop on d6, from \d+ squares to \d+; g5 keeps it open$/);
  });

  it('says nothing when the better move shuts the same piece in', () => {
    expect(blocksOwnPieceText(FEN, play(FEN, 'f4'), play(FEN, 'Qe5'))).toBeNull();
  });

  it('names the piece a pawn move opens', () => {
    const closed = 'rnbqkbnr/ppp1pppp/8/3p4/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(opensOwnPieceText(closed, play(closed, 'd3'))).toMatch(/^Opens the (bishop on c1|queen on d1)/);
  });

  it('names the defended piece a move piles another attacker on', () => {
    const fen = '4k3/8/4p3/3n4/8/1BN5/4Q3/4K3 w - - 0 1';
    expect(pilesOnText(fen, play(fen, 'Qd3'))).toBe('adds a third attacker to the knight on d5, which has one defender');
    expect(pilesOnText(fen, play(fen, 'Kd1'))).toBeNull();
  });
});

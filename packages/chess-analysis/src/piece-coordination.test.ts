import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { blocksOwnPieceText, connectsRooksText, freesEnemyPieceText, opensOwnPieceText, pilesOnText, supportsAdvancedPieceText } from './piece-coordination.js';

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
    expect(opensOwnPieceText(closed, play(closed, 'd3'))).toBeNull();
    const later = 'rnbqkbnr/pppppppp/8/8/8/3P4/PPP2PPP/RNBQKBNR w KQkq - 0 1';
    expect(opensOwnPieceText(later, play(later, 'd4'))).toMatch(/^Opens the bishop on f1/);
  });

  it('names the defended piece a move piles another attacker on', () => {
    const fen = '4k3/8/4p3/3n4/8/1BN5/4Q3/4K3 w - - 0 1';
    expect(pilesOnText(fen, play(fen, 'Qd3'))).toBe('adds a third attacker to the knight on d5, which has one defender');
    expect(pilesOnText(fen, play(fen, 'Kd1'))).toBeNull();
  });

  it('says a move connects the rooks, but not a rook move or castling', () => {
    const fen = 'r3k2r/pppq1ppp/2n5/8/8/2N5/PPPQ1PPP/R3K2R w KQkq - 0 1';
    expect(connectsRooksText(fen, play(fen, 'Qe3'))).toBeNull();
    const rooks = '4k3/8/8/8/8/8/6K1/R2Q3R w - - 0 1';
    expect(connectsRooksText(rooks, play(rooks, 'Qd2'))).toBe('connects the rooks');
    expect(connectsRooksText(rooks, play(rooks, 'Rb1'))).toBeNull();
  });

  it('says a pawn move that supports an advanced knight', () => {
    const fen = '4k3/8/8/4N3/8/5P2/3P4/4K3 w - - 0 1';
    expect(supportsAdvancedPieceText(fen, play(fen, 'd4'))).toBe('supports the knight on e5 with the pawn');
    expect(supportsAdvancedPieceText(fen, play(fen, 'f4'))).toBe('supports the knight on e5 with the pawn');
  });

  it("says a move that takes the pawn shutting in the opponent's bishop", () => {
    const fen = '2kr3r/ppp2ppp/2bb1q2/3p4/3P1p2/2P1PN2/PPQN1PPP/R4RK1 w - - 0 13';
    const text = freesEnemyPieceText(fen, play(fen, 'exf4'), ['Qxf4', 'Bxf4'], (after, san) => (san === 'Bxf4' ? 'attacks the knight on d2' : null));
    expect(text).toMatch(/^exf4 takes the pawn that shut in Black's bishop on d6: Bxf4 frees it, from 6 squares to \d+, and attacks the knight on d2$/);
  });
});

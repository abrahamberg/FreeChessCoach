import { describe, expect, test } from 'vitest';
import { checkAnswerSets, exchangeGain, lineGain, mentionOn, mentions, moveIsSound, settledGain } from './oracle.js';

/** The audit's own board checks. A wrong check invents errors (or hides
 * them) across the whole corpus, so each one that misfired once stays here
 * on the position that showed it. */
describe('review audit oracle', () => {
  test('a piece defended as often as it is attacked, by an equal trade, cannot be won (the owner game, 13…Bd3)', () => {
    const afterBd3 = 'r2r2k1/p1p2ppp/2n5/1pB1N3/8/2Pb1N2/PP3PPP/R4RK1 w - - 1 14';
    expect(exchangeGain(afterBd3, 'd3', 'w')).toBe(0);
  });

  test('an undefended piece can be won whole', () => {
    expect(exchangeGain('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', 'd5', 'w')).toBe(3);
  });

  test('a pinned attacker does not count', () => {
    // The white knight on d4 is pinned to its king by the rook on d8.
    expect(exchangeGain('3rk3/8/8/4b3/3N4/8/8/3K4 w - - 0 1', 'e5', 'w')).toBe(0);
  });

  test('mentions read colour, piece and square, and a named piece must stand there', () => {
    const found = mentions('unveils the rook on d1 against the black queen on d6');
    expect(found.map((mention) => `${mention.color ?? '-'}${mention.piece}${mention.square}`)).toEqual(['-rd1', 'bqd6']);
    const afterQxc7 = '8/2Q3pp/8/1pBk4/5p2/2Pr4/P4PPP/R5K1 b - - 0 25';
    expect(found.some((mention) => mentionOn(afterQxc7, mention))).toBe(false);
  });

  test('material over a line is counted for the side asked', () => {
    expect(lineGain('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', ['Rxd5'], 'w')).toBe(3);
    expect(lineGain('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', ['Rxd5'], 'b')).toBe(-3);
  });

  test('a capture wins what it holds when the line goes quiet, whatever the line does later', () => {
    // The Opera game, 8.Qxb7: a pawn up after the queens come off; the
    // engine's line gives a pawn back at its twelfth ply.
    const opera = 'rn2kb1r/ppp1qppp/5n2/4p3/2B1P3/1Q6/PPP2PPP/RNB1K2R w KQkq - 4 8';
    const operaLine = ['Qxb7', 'Qb4+', 'Qxb4', 'Bxb4+', 'Ke2', 'Bc5', 'Nd2', 'Ke7', 'Nb3', 'Bb6', 'a4', 'Nxe4'];
    expect(lineGain(opera, operaLine, 'w')).toBe(0);
    expect(settledGain(opera, operaLine, 'w')).toBe(1);
    // The owner game, 18…Rxd3: a knight, then White's a-pawn queens anyway.
    const owner = '3r2k1/2p2ppp/8/PpBr4/8/2PN4/P4PPP/R2R2K1 b - - 0 18';
    expect(settledGain(owner, ['Rxd3', 'Rxd3', 'Rxd3', 'a6', 'Rxc3', 'a7', 'h5', 'a8=Q+', 'Kh7', 'Qe4+'], 'b')).toBe(3);
  });

  test('a capture taken straight back wins nothing', () => {
    // 9…Bxc5 takes a pawn and Qxd5 takes one back before the line is quiet.
    const fen = 'r1bq1rk1/pp2bppp/2n2n2/2Pp2B1/8/2N2N2/PPP1BPPP/R2Q1RK1 b - - 0 9';
    expect(settledGain(fen, ['Bxc5', 'Bxf6', 'Qxf6', 'Qxd5', 'Bb4', 'Qb3'], 'b')).toBeLessThan(1);
  });

  test('a capture the engine would not play is not a sound move to name (39.Kc3, "win a rook with dxc6")', () => {
    // 6k1/3p1pp1/2RP3p/8/6P1/1pK4P/1B5r/8 b: …Rc2+ wins; …dxc6 lets d7 and d8=Q.
    const lines = [
      { san: 'Rc2+', cp: -589, mate: null },
      { san: 'h5', cp: 100, mate: null },
      { san: 'dxc6', cp: 155, mate: null }
    ];
    expect(moveIsSound(lines, 'dxc6', 'b')).toBe(false);
    expect(moveIsSound(lines, 'Rc2+', 'b')).toBe(true);
    // Second best but still winning: sound.
    expect(moveIsSound([{ san: 'Qxa1+', cp: -900, mate: null }, { san: 'Bxg1', cp: -400, mate: null }], 'Bxg1', 'b')).toBe(true);
  });

  test('the king taking the checker is a capture, not a king move (8.Qxd8+ in the Berlin)', () => {
    expect(checkAnswerSets('r1bQkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK1 b kq - 0 8')).toEqual({ blocks: [], captures: ['Kxd8'], kingMoves: [] });
    // The Evergreen, 21.Qxd7+: the king can take or step aside.
    expect(checkAnswerSets('1r2k1r1/pbpQnp1p/1b3P2/8/8/B1PB1q2/P4PPP/3R2K1 b - - 0 21')).toEqual({ blocks: [], captures: ['Kxd7'], kingMoves: ['Kf8'] });
  });
});

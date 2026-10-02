import { describe, expect, test } from 'vitest';
import { mateClaims, mateCountExact, mateCountOwed } from './check-mate-count.js';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { checkReviewItem } from './check-review.js';
import { unmetExpectations } from './items.js';
import { checkAnswerSets, decidedFor, exchangeGain, hasPassedPawnOn, mateCountAgrees, pinnersThrough, play, prizeWon, lineGain, mentionOn, mentions, moveIsSound, settledGain } from './oracle.js';
import type { AuditItem, AuditPosition } from './types.js';

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

  test('a pawn with an enemy pawn beside it, none ahead, is already passed (the owner game, 19.a6 "Creates a passed pawn")', () => {
    expect(hasPassedPawnOn('3r2k1/2p3pp/8/PpBr1p2/8/2PN4/P4PPP/R2R2K1 w - - 0 19', 'a', 'w')).toBe(true);
    // One move earlier the a-pawn stood on a2 behind Black's a5: not passed until bxa5.
    expect(hasPassedPawnOn('3r2k1/2p2ppp/8/ppBr4/1P6/2PN4/P4PPP/R2R2K1 w - - 0 18', 'a', 'w')).toBe(false);
  });

  test('a prize is won when the line nets more than half of it (a judge\'s audit-bug: the Petrov\'s Nc6+ wins the queen for a knight)', () => {
    expect(prizeWon(9, 6)).toBe(true);
    // A rook for a knight is the exchange, not a rook.
    expect(prizeWon(5, 2)).toBe(false);
    expect(prizeWon(3, 2)).toBe(true);
    expect(prizeWon(1, 0)).toBe(false);
  });

  test('a mate count is owed when the mate is short and the search covers it (the owner\'s rule, 2026-10-02; 24…Qxh3 at depth 12)', () => {
    // After 24…Qxh3 White is to move and mated: in 10 by the depth-12 search, in 5 on the board. Neither is a count that search can stand behind.
    expect(mateCountOwed(-10, 'b', 'w', 12)).toBe(false);
    expect(mateCountOwed(-5, 'b', 'w', 12)).toBe(false);
    // Five plies from the searched board: the side to move mates in 3, or is mated in 2.
    expect(mateCountOwed(3, 'w', 'w', 12)).toBe(true);
    expect(mateCountOwed(-2, 'b', 'w', 12)).toBe(true);
    expect(mateCountOwed(-3, 'b', 'w', 18)).toBe(false);
    expect(mateCountOwed(4, 'w', 'w', 18)).toBe(false);
    // A deep search covers it, up to seven moves.
    expect(mateCountOwed(-5, 'b', 'w', 34)).toBe(true);
    expect(mateCountOwed(7, 'w', 'w', 40)).toBe(true);
    expect(mateCountOwed(8, 'w', 'w', 60)).toBe(false);
    // No mate on the line, or the other side's: nothing owed.
    expect(mateCountOwed(null, 'w', 'w', 12)).toBe(false);
    expect(mateCountOwed(-2, 'w', 'w', 12)).toBe(false);
  });

  test('a mate card\'s count is the engine\'s, from the card\'s own move (24…Qxh3: mate in 6 before, 5 after)', () => {
    // Played: the card counts 6 from Qxh3, the line that answers it has 5.
    expect(mateCountAgrees(6, 'Qxh3', { mate: -5 }, true)).toBe(true);
    expect(mateCountAgrees(5, 'Qxh3', { mate: -5 }, true)).toBe(false);
    // Missed or allowed: the named move's own line.
    expect(mateCountAgrees(8, 'Rxf3+', { mate: -8 }, false)).toBe(true);
    expect(mateCountAgrees(8, 'Rxf3+', { mate: -7 }, false)).toBe(false);
    expect(mateCountAgrees(2, 'Rxf3+', { mate: null }, false)).toBe(false);
    // The move is the mate: 1, whatever line is held.
    expect(mateCountAgrees(1, 'Rc1#', undefined, true)).toBe(true);
    expect(mateCountAgrees(2, 'Qh7#', { mate: 1 }, false)).toBe(false);
  });

  test('a mate count is not longer than a deeper search finds (24…Qxh3: "They forced mate in 10", mate in 5 on the board)', () => {
    // 1k4r1/ppp3r1/2n4p/2P5/5p2/P2P1P1q/1P3QP1/R4RK1 w: the deeper search's best defence, Qg3, is mated in 5.
    const afterQxh3 = { mate: -5 };
    expect(mateCountExact(10, 'b', afterQxh3)).toBe(false);
    expect(mateCountExact(5, 'b', afterQxh3)).toBe(true);
    // A mate found is a proof: a deeper search that only finds a slower
    // one, or none, or does not list the move, shows nothing against it.
    expect(mateCountExact(5, 'b', { mate: -6 })).toBe(true);
    expect(mateCountExact(5, 'b', { mate: null })).toBe(true);
    expect(mateCountExact(5, 'b', undefined)).toBe(true);
    // The other side mating on that line contradicts the sentence.
    expect(mateCountExact(5, 'b', { mate: 3 })).toBe(false);
  });

  test('a sentence\'s forced mate belongs to one line of one board, with its count or without', () => {
    // Played: the board after the move.
    expect(mateClaims('review:tactic-opportunity:found:checkmate', 'They forced mate in 2.', 'black')).toEqual([{ said: 2, side: 'b', at: 'after', san: null }]);
    expect(mateClaims('review:tactic-opportunity:found:checkmate', 'They forced mate.', 'black')).toEqual([{ said: null, side: 'b', at: 'after', san: null }]);
    // Named: the named move's own line, before the move for a missed one, after it for an allowed one.
    expect(mateClaims('dossier:tactics', 'You missed a chance to force mate in 3 through a mating net with Rxf7+ — closes the net.', 'white')).toEqual([{ said: 3, side: 'w', at: 'before', san: 'Rxf7+' }]);
    expect(mateClaims('review:tactic-allowed:checkmate', 'You let them force mate with Rb1+.', 'white')).toEqual([{ said: null, side: 'b', at: 'after', san: 'Rb1+' }]);
    expect(mateClaims('review:reason:missed-mate', 'Missed mate in 3 starting with Rxf3+', 'black')).toEqual([{ said: 3, side: 'b', at: 'before', san: 'Rxf3+' }]);
    expect(mateClaims('review:reason:missed-mate', 'Missed a forced mate starting with Rxf3+', 'black')).toEqual([{ said: null, side: 'b', at: 'before', san: 'Rxf3+' }]);
    expect(mateClaims('dossier:verdict', 'before: Black has a forced mate → after: Black has a forced mate in 2', 'black')).toEqual([
      { said: null, side: 'b', at: 'before', san: null },
      { said: 2, side: 'b', at: 'after', san: null }
    ]);
    expect(mateClaims('dossier:alternative', 'Rg3: Black has a forced mate', 'black')).toEqual([{ said: null, side: 'b', at: 'before', san: 'Rg3' }]);
    // A checkmate on the board is no forced mate to count.
    expect(mateClaims('review:tactic-opportunity:found:checkmate', 'You delivered checkmate.', 'white')).toEqual([]);
    expect(mateClaims('dossier:verdict', 'before: White is winning → after: checkmate', 'white')).toEqual([]);
  });

  test('a game is decided at a forced mate or five pawns (owner calibration: 35…d2 at -7.7)', () => {
    expect(decidedFor([{ cp: -769, mate: null }])).toBe('b');
    expect(decidedFor([{ cp: null, mate: 5 }])).toBe('w');
    // 47.Qe4 at -0.88 is still a game.
    expect(decidedFor([{ cp: -88, mate: null }])).toBeNull();
    expect(decidedFor([])).toBeNull();
  });

  test('the king taking the checker is a capture, not a king move (8.Qxd8+ in the Berlin)', () => {
    expect(checkAnswerSets('r1bQkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK1 b kq - 0 8')).toEqual({ blocks: [], captures: ['Kxd8'], kingMoves: [] });
    // The Evergreen, 21.Qxd7+: the king can take or step aside.
    expect(checkAnswerSets('1r2k1r1/pbpQnp1p/1b3P2/8/8/B1PB1q2/P4PPP/3R2K1 b - - 0 21')).toEqual({ blocks: [], captures: ['Kxd7'], kingMoves: ['Kf8'] });
  });

  test('a pin is a line piece looking through one piece at another', () => {
    // The owner's game after 4.Bg5: the knight on f6 stands between the bishop and the queen.
    const afterBg5 = 'rnbqkb1r/ppp2ppp/5n2/3pp1B1/4P3/3P1P2/PPP3PP/RN1QKBNR b KQkq - 1 4';
    expect(pinnersThrough(afterBg5, 'f6', 'd8', 'w')).toEqual(['g5']);
    // Not to the king: e7 is not on that line's far side of f6.
    expect(pinnersThrough(afterBg5, 'f6', 'e8', 'w')).toEqual([]);
    // With …Be7 played the bishop stands between: the knight is not pinned to the queen.
    expect(pinnersThrough('rnbqk2r/ppp1bppp/5n2/3pp1B1/4P3/3P1P2/PPP3PP/RN1QKBNR w KQkq - 2 5', 'f6', 'd8', 'w')).toEqual([]);
  });

  /** The failing checks of one review reason on one move. */
  const failing = (source: string, text: string, mover: 'white' | 'black', fenBefore: string, san: string): string[] =>
    checkReviewItem({ source, text, data: null } as AuditItem, { mover, san, fenBefore, fenAfter: play(fenBefore, san) ?? '', linesBefore: [], linesAfter: [] } as unknown as AuditPosition)
      .filter((check) => !check.ok)
      .map((check) => check.check);

  test('the pin note is checked on the board: the piece, the line, new with the move, the pinner not lost', () => {
    const before = 'rnbqkb1r/ppp2ppp/5n2/3pp3/4P3/3P1P2/PPP3PP/RNBQKBNR w KQkq - 0 4';
    expect(failing('review:reason:pin', 'Pins the knight on f6 to the queen', 'white', before, 'Bg5')).toEqual([]);
    expect(failing('review:reason:pin', 'Pins the knight on f6 to the king', 'white', before, 'Bg5')).toEqual(['pin-line', 'pin-new']);
    expect(failing('review:reason:pin', 'Pins the bishop on f6 to the queen', 'white', before, 'Bg5')).toEqual(['pinned-piece']);
    // The pin stood already: a3 did not make it, and neither does the bishop sliding along its line.
    const pinned = 'rnbqkb1r/ppp2ppp/5n2/3pp1B1/4P3/3P1P2/PPP3PP/RN1QKBNR w KQkq - 0 4';
    expect(failing('review:reason:pin', 'Pins the knight on f6 to the queen', 'white', pinned, 'a3')).toEqual(['pin-new']);
    expect(failing('review:reason:pin', 'Pins the knight on f6 to the queen', 'white', pinned, 'Bh4')).toEqual(['pin-new']);
    // …h6 is on the board: the bishop is taken.
    expect(failing('review:reason:pin', 'Pins the knight on f6 to the queen', 'white', 'rnbqkb1r/ppp2pp1/5n1p/3pp3/4P3/3P1P2/PPP3PP/RNBQKBNR w KQkq - 0 5', 'Bg5')).toEqual(['pinner-safe']);
    // 11.Bg5 in `CAGz80hT`: the queen on h4 already looked through f6 at the queen. The bishop is a new pinner.
    expect(failing('review:reason:pin', 'Pins the knight on f6 to the queen', 'white', 'r2q1rk1/pbpn1ppp/1p1bpn2/8/3P3Q/2NBBP2/PPP1N1PP/R4RK1 w - - 4 11', 'Bg5')).toEqual([]);
  });

  test('the kick note is checked on the board: a quiet pawn move, a new attack, a safe pawn, and the pin it names', () => {
    const before = 'rnbqkb1r/ppp2ppp/5n2/3pp1B1/4P3/3P1P2/PPP3PP/RN1QKBNR b KQkq - 1 4';
    expect(failing('review:reason:kick', 'Attacks the bishop on g5, which pins the knight on f6', 'black', before, 'h6')).toEqual([]);
    expect(failing('review:reason:kick', 'Attacks the knight on g5', 'black', before, 'h6')).toEqual(['attacked-piece']);
    expect(failing('review:reason:kick', 'Attacks the bishop on g5, which pins the pawn on e5', 'black', before, 'h6')).toEqual(['pins-piece']);
    // No g-pawn behind it: the bishop takes the pawn for nothing.
    expect(failing('review:reason:kick', 'Attacks the bishop on g5', 'black', '4k3/7p/8/6B1/8/8/8/4K3 b - - 0 1', 'h6')).toEqual(['pawn-safe']);
    // The pawn on f6 already hit the bishop.
    expect(failing('review:reason:kick', 'Attacks the bishop on g5', 'black', '4k3/6pp/5p2/6B1/8/8/8/4K3 b - - 0 1', 'h6')).toEqual(['attack-new']);
  });

  test('the trade note is checked on the board: what was taken, with what, and that it can be taken back', () => {
    const before = 'rnbqkb1r/ppp2pp1/5n1p/3pp1B1/4P3/3P1P2/PPP3PP/RN1QKBNR w KQkq - 0 5';
    expect(failing('review:reason:trade', 'Trades the bishop for the knight on f6', 'white', before, 'Bxf6')).toEqual([]);
    expect(failing('review:reason:trade', 'Trades the knight for the bishop on f6', 'white', before, 'Bxf6')).toEqual(['took-piece', 'took-with']);
    expect(failing('review:reason:trade', 'Recaptures the knight on f6', 'white', before, 'Bxf6')).toEqual([]);
    expect(failing('review:reason:trade', "Trades the bishop for the knight on f6, giving up White's only developed piece; Black can take back with the queen, bringing it out", 'white', before, 'Bxf6')).toEqual([]);
    // The knight on b8 cannot reach f6.
    expect(failing('review:reason:trade', "Trades the bishop for the knight on f6, giving up White's only developed piece; Black can take back with the knight, developing it", 'white', before, 'Bxf6')).toEqual(['takes-back-from-home']);
    // With the knight on f3 out as well, the bishop is not the only one.
    expect(failing('review:reason:trade', "Trades the bishop for the knight on f6, giving up White's only developed piece", 'white', 'rnbqkb1r/ppp2pp1/5n1p/3pp1B1/4P3/3P1N2/PPP2PPP/RN1QKB1R w KQkq - 0 5', 'Bxf6')).toEqual(['only-developed']);
    // A knight nobody defends is won, not traded.
    expect(failing('review:reason:trade', 'Trades knights on d4', 'black', '4k3/8/2n5/8/3N4/8/8/4K3 b - - 0 1', 'Nxd4')).toEqual(['can-take-back']);
    // En passant takes a pawn that does not stand on the square (10.exd6 in `L7CCk08Y`).
    expect(failing('review:reason:trade', 'Trades pawns on d6', 'white', 'r1bqkb1r/ppp2p1p/6np/3pP3/2BP4/2N2Q2/PPP2PPP/R3K2R w KQkq d6 0 10', 'exd6')).toEqual([]);
    // …and one that mates is no trade: nothing takes back.
    expect(failing('review:reason:trade', 'Trades pawns on g6', 'white', '7r/8/7p/R4Ppk/8/3B1PK1/8/7q w - g6 0 1', 'fxg6#')).toEqual(['can-take-back']);
  });

  test('a seed says what the owner expected to read: an unmet expectation is a failing item', () => {
    const move = (ply: number, reasons: string[]): ClassifiedMoveDto => ({ ply, quality: 'good', reasons, bestLineSan: [] }) as unknown as ClassifiedMoveDto;
    const moves = [move(7, ['Pins the knight on f6 to the queen']), move(8, []), move(9, ['Concedes the centre'])];
    const expected = [{ ply: 7, says: 'pins the knight' }, { ply: 8, says: 'Attacks the bishop on g5' }, { ply: 9, says: 'Trades the bishop' }, { ply: 40, says: 'anything' }];
    expect(unmetExpectations(expected, moves).map(({ move: each, says }) => `${each.ply}:${says}`)).toEqual(['8:Attacks the bishop on g5', '9:Trades the bishop']);
    const before = 'rnbqkb1r/ppp2pp1/5n1p/3pp1B1/4P3/3P1P2/PPP3PP/RN1QKBNR w KQkq - 0 5';
    expect(failing('review:expected', 'nothing on this move says "Trades the bishop"', 'white', before, 'Bxf6')).toEqual(['expected-point']);
  });
});

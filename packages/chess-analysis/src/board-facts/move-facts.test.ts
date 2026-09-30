import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { boardFacts } from './move-facts.js';

const after = (pgn: string): string => {
  const chess = new Chess();
  chess.loadPgn(pgn);
  return chess.fen();
};
const facts = (fen: string, san: string): string => boardFacts(fen, san).join(' | ');

// The Englund trap, the run before each move named.
const ENGLUND = '1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2';

describe('board facts', () => {
  test('a capture that can be taken back is a trade, not "hanging"', () => {
    expect(facts(after('1. e4 c5 2. Nf3 d6 3. d4'), 'cxd4')).not.toContain('hanging');
  });

  test('a piece hangs only if a legal capture of it loses nothing over the exchange', () => {
    // …Qxa1 is answered by Bxa1 through b2, so the rook on a1 is not loose.
    expect(facts(after(ENGLUND), 'Bc3')).not.toContain('rook on a1 hanging');
    // Qxd5 walks into exd5: really loose.
    expect(facts('4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1', 'Qxd5')).toContain('queen on d5 hanging');
  });

  test("a hanging piece is named with its owner's colour", () => {
    expect(facts('4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1', 'Qxd5')).toContain('white queen on d5');
    expect(facts('3qk3/8/8/8/8/4P3/8/4K3 b - - 0 1', 'Qd4')).toContain('black queen on d4');
  });

  test('a fork needs two targets and a forker that cannot simply be taken', () => {
    expect(facts('2q3k1/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1', 'Ne7+')).toMatch(/knight on e7 forks .*queen on c8.*king on g8/);
    // The rook takes the queen: nothing is forked.
    expect(facts('r6k/6pp/7N/8/2Q5/8/6PP/6K1 w - - 0 3', 'Qg8+')).not.toContain('forks');
    // A mate ends the game: no fork, no attack.
    expect(facts(after('1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nd7 5. Qe2 Ngf6'), 'Nd6#')).not.toMatch(/attacks|forks/);
  });

  test('how a check can be answered lists every block, capture and king move', () => {
    const check = facts(after('1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4'), 'Qb4+');
    for (const block of ['Bd2', 'Nfd2', 'c3', 'Nc3', 'Nbd2', 'Qd2']) expect(check).toContain(block);
    expect(check).toContain('the king cannot move');
    // The king takes the checker: the capture is listed, and there is no block.
    expect(facts('r1bqkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNBQ1RK1 w kq - 1 8', 'Qxd8+')).toMatch(/no block.*take the checking piece with Kxd8/);
  });

  test('why it is mate covers every square around the king', () => {
    const mate = facts(after(`${ENGLUND} 6. Bc3 Bb4 7. Qd2 Bxc3 8. Qxc3`), 'Qc1#');
    expect(mate).toContain('why it is mate');
    for (const square of ['d1', 'd2', 'e2', 'f1', 'f2']) expect(mate).toContain(square);
  });

  test('a discovered or double check names the other checking piece', () => {
    expect(facts(after('1. e4 e5 2. Nf3 Nf6 3. Nxe5 Nxe4 4. Qe2 Nf6'), 'Nc6+')).toMatch(/discovered check from the queen on e2/);
  });

  test('en passant names the pawn actually taken', () => {
    const en = facts('7r/8/7p/R4Ppk/8/3B1PK1/8/7q w - g6 0 1', 'fxg6#');
    expect(en).toContain('captures the pawn on g5 en passant');
    expect(en).not.toContain('captures the pawn on g6');
  });
});

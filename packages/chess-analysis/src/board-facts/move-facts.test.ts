import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { boardFacts } from './move-facts.js';
import type { BoardFact, BoardFactKind } from './types.js';

const after = (pgn: string): string => {
  const chess = new Chess();
  chess.loadPgn(pgn);
  return chess.fen();
};
const facts = (fen: string, san: string): BoardFact[] => boardFacts(fen, san);
const only = <K extends BoardFactKind>(list: BoardFact[], kind: K): Extract<BoardFact, { kind: K }>[] => list.filter((fact): fact is Extract<BoardFact, { kind: K }> => fact.kind === kind);

// The Englund trap, the run before each move named.
const ENGLUND = '1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2';

describe('board facts as data', () => {
  test('moved, castles, promotes and captures', () => {
    expect(facts('4k3/8/8/8/8/8/8/4KB2 w - - 0 1', 'Bc4')[0]).toEqual({ kind: 'moved', piece: 'b', from: 'f1', to: 'c4' });
    expect(facts('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'O-O-O')).toEqual([{ kind: 'castles', wing: 'queenside' }]);
    expect(only(facts('8/P7/8/8/8/8/k6K/8 w - - 0 1', 'a8=Q'), 'promotes')).toEqual([{ kind: 'promotes', piece: 'q' }]);
    expect(only(facts('4k3/8/8/3p4/8/8/8/3RK3 w - - 0 1', 'Rxd5'), 'captures')).toEqual([{ kind: 'captures', piece: 'p', square: 'd5', enPassant: false }]);
  });

  test('en passant names the square of the pawn actually taken', () => {
    const [capture] = only(facts('7r/8/7p/R4Ppk/8/3B1PK1/8/7q w - g6 0 1', 'fxg6#'), 'captures');
    expect(capture).toEqual({ kind: 'captures', piece: 'p', square: 'g5', enPassant: true });
  });

  test('blocksCheck names the checker; a discovered check names the other checker', () => {
    expect(only(facts('4k3/8/8/8/8/8/3r4/R3K2R w - - 0 1', 'Rd1'), 'blocksCheck')).toEqual([]);
    expect(only(facts(after('1. e4 e5 2. Nf3 Nf6 3. Nxe5 Nxe4 4. Qe2 Nf6'), 'Nc6+'), 'discoveredCheck')).toEqual([{ kind: 'discoveredCheck', checkers: [{ piece: 'q', square: 'e2' }] }]);
  });

  test('the opposition and the rule of the square', () => {
    expect(only(facts('8/p7/8/4k3/8/8/P2K4/8 w - - 0 1', 'Ke3'), 'opposition')).toHaveLength(1);
    expect(only(facts('8/8/8/8/8/1k6/6P1/7K w - - 0 1', 'g4'), 'outsideSquare')).toEqual([{ kind: 'outsideSquare', king: { side: 'black', square: 'b3' } }]);
  });

  test('a back-rank mate, and why it is mate square by square', () => {
    const mate = facts('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Ra8#');
    expect(only(mate, 'gives')).toEqual([{ kind: 'gives', check: 'checkmate' }]);
    expect(only(mate, 'backRankMate')).toHaveLength(1);
    expect(only(mate, 'mateNet')).toEqual([
      { kind: 'mateNet', king: 'g8', checkers: [{ piece: 'r', square: 'a8' }], ownSquares: ['f7', 'g7', 'h7'], covered: [{ squares: ['f8', 'h8'], by: [{ piece: 'r', square: 'a8' }] }], guarded: [] }
    ]);
  });

  test('how a check can be answered lists every block, capture and king move', () => {
    const [answers] = only(facts(after('1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4'), 'Qb4+'), 'checkAnswers');
    expect(answers?.blocks).toEqual(expect.arrayContaining(['Bd2', 'Nfd2', 'c3', 'Nc3', 'Nbd2', 'Qd2']));
    expect(answers?.kingMoves).toEqual([]);
    // The king takes the checker: the capture is listed, and there is no block.
    const [taken] = only(facts('r1bqkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNBQ1RK1 w kq - 1 8', 'Qxd8+'), 'checkAnswers');
    expect(taken).toMatchObject({ blocks: [], captures: ['Kxd8'] });
  });

  test('an attacked piece carries its pin', () => {
    const [attack] = only(facts('4k3/3n4/8/8/8/1B6/8/4K3 w - - 0 1', 'Ba4'), 'attacks');
    expect(attack).toEqual({ kind: 'attacks', piece: { piece: 'n', square: 'd7' }, pinnedTo: { target: { piece: 'k', square: 'e8' }, by: { piece: 'b', square: 'a4' } } });
  });

  test('a capture that can be taken back is a trade, not a loose piece', () => {
    expect(only(facts(after('1. e4 c5 2. Nf3 d6 3. d4'), 'cxd4'), 'leavesHanging')).toHaveLength(0);
  });

  test('a piece is loose only if a legal capture of it loses nothing over the exchange, and names its owner', () => {
    // …Qxa1 is answered by Bxa1 through b2, so the rook on a1 is not loose.
    expect(only(facts(after(ENGLUND), 'Bc3'), 'leavesHanging').map((fact) => fact.piece.square)).not.toContain('a1');
    expect(only(facts('4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1', 'Qxd5'), 'leavesHanging')).toEqual([
      { kind: 'leavesHanging', piece: { piece: 'q', square: 'd5' }, owner: 'white', stalemateIfTaken: false }
    ]);
    expect(only(facts('3qk3/8/8/8/8/4P3/8/4K3 b - - 0 1', 'Qd4'), 'leavesHanging')[0]?.owner).toBe('black');
  });

  test('a fork needs two targets and a forker that cannot simply be taken', () => {
    expect(only(facts('2q3k1/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1', 'Ne7+'), 'forks')).toEqual([
      { kind: 'forks', piece: { piece: 'n', square: 'e7' }, targets: [{ piece: 'q', square: 'c8' }, { piece: 'k', square: 'g8' }] }
    ]);
    // The rook takes the queen: nothing is forked.
    expect(only(facts('r6k/6pp/7N/8/2Q5/8/6PP/6K1 w - - 0 3', 'Qg8+'), 'forks')).toHaveLength(0);
    // A mate ends the game: no fork, no attack.
    const mate = facts(after('1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nd7 5. Qe2 Ngf6'), 'Nd6#');
    expect([...only(mate, 'forks'), ...only(mate, 'attacks')]).toHaveLength(0);
  });
});

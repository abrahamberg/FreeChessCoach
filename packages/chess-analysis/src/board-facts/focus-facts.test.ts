import { describe, expect, test } from 'vitest';
import { focusFacts } from './focus-facts.js';
import { renderBoardFact } from './render.js';

// White to move. The knight on b6 attacks the undefended bishop on c4; the bishop can take the pawn on d5; Rh8 and Bb5 give check.
const FEN = '4k3/8/1n6/3p4/2B5/8/8/4K2R w - - 0 1';
const ask = (codes: string[], playedSan = 'Rh5', student: 'white' | 'black' = 'white') => focusFacts({ fenBefore: FEN, playedSan, student, codes });

describe('focusFacts', () => {
  test('loose pieces of both sides, before and after, for a blindness focus area', () => {
    const facts = ask(['BV-01']);
    expect(facts?.loose?.before).toContainEqual({ square: 'c4', piece: 'b', owner: 'w', tier: 'free' });
    expect(facts?.loose?.after).toContainEqual({ square: 'c4', piece: 'b', owner: 'w', tier: 'free' });
    expect(facts?.opponentNext).toBeUndefined();
  });

  test("the opponent's checks, captures and threats after the move, for a threat-blindness focus area", () => {
    const facts = ask(['MS-02']);
    expect(facts?.opponentNext?.captures).toEqual(['Nxc4', 'dxc4']);
    expect(facts?.opponentNext?.threats.map((piece) => piece.square)).toContain('c4');
  });

  test("the student's own checks and captures before the move, for a missed-chances focus area", () => {
    const facts = ask(['MS-05']);
    expect(facts?.ownBefore?.captures).toEqual(['Bxd5']);
    expect(facts?.ownBefore?.checks).toEqual(expect.arrayContaining(['Bb5+', 'Rh8+']));
  });

  test("whether the moved piece's new square is safe, for a piece-safety focus area", () => {
    expect(ask(['BV-15'], 'Bxd5')?.newSquare).toEqual({ piece: { piece: 'b', square: 'd5' }, safe: false });
    expect(ask(['MS-08'], 'Bb5+')?.newSquare).toEqual({ piece: { piece: 'b', square: 'b5' }, safe: true });
  });

  test('the opposition, for an endgame focus area', () => {
    const facts = focusFacts({ fenBefore: '8/p7/3k4/8/8/4K3/P7/8 w - - 0 1', playedSan: 'Kd4', student: 'white', codes: ['EG-01'] });
    expect(facts?.endgame?.map((fact) => fact.kind)).toEqual(['opposition']);
    expect(facts?.endgame?.map(renderBoardFact)[0]).toContain('opposition');
  });

  test("nothing for the opponent's move, or when no focus area asks", () => {
    expect(ask(['BV-01'], 'Rh5', 'black')).toBeNull();
    expect(ask(['BV-03'])).toBeNull();
    expect(ask([])).toBeNull();
  });
});

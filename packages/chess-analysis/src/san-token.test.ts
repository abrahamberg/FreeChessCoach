import { describe, expect, test } from 'vitest';
import { BARE_SAN, MOVE_TOKEN, SAN_MOVE } from './san-token.js';

describe('san-token', () => {
  test('MOVE_TOKEN finds numbered moves, keeping the check suffix', () => {
    const matches = [...'Play 12. Qh5+ then 12...g6 or 13-Nf3'.matchAll(MOVE_TOKEN)];

    expect(matches.map(([, number, separator, san]) => [number, separator, san])).toEqual([
      ['12', '.', 'Qh5+'],
      ['12', '...', 'g6'],
      ['13', '-', 'Nf3']
    ]);
  });

  test('BARE_SAN finds moves without a number, including castling and promotion', () => {
    const matches = [...'Nf3, O-O-O# and exd8=Q are fine'.matchAll(BARE_SAN)].map((match) => match[1]);

    expect(matches).toEqual(['Nf3', 'O-O-O#', 'exd8=Q']);
  });

  test('SAN_MOVE does not match a word that only starts like a move', () => {
    expect(new RegExp(`^(?:${SAN_MOVE})$`).test('Nf3x')).toBe(false);
    expect([...'a4x1'.matchAll(BARE_SAN)]).toEqual([]);
  });
});

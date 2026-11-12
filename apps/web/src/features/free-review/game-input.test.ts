import { describe, expect, test } from 'vitest';
import { readGameInput } from './game-input.js';

describe('readGameInput', () => {
  test('takes a PGN with moves and refuses one without', () => {
    expect(readGameInput('1. e4 e5 2. Nf3 *')).toEqual({ ok: true, pgn: '1. e4 e5 2. Nf3 *' });
    expect(readGameInput('[Event "x"]\n\n*').ok).toBe(false);
    expect(readGameInput('1. e4 e4').ok).toBe(false);
    expect(readGameInput('   ').ok).toBe(false);
  });
});

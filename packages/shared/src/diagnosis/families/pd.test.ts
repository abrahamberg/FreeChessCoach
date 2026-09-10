import { expect, test } from 'vitest';
import { PD_CODES } from './pd.js';

test('every PD entry is game_leak evidence, dialogue detectability, no_plan parent, direction N', () => {
  for (const entry of PD_CODES) {
    expect(entry.evidenceTrack).toBe('game_leak');
    expect(entry.detectability).toBe('dialogue');
    expect(entry.parentCategory).toBe('no_plan');
    expect(entry.directions).toEqual(['N']);
  }
});

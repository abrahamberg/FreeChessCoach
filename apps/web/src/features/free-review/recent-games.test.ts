import { describe, expect, test } from 'vitest';
import { playerSide } from './recent-games.js';

describe('playerSide', () => {
  test('finds the username on either side, whatever its case', () => {
    expect(playerSide({ whiteName: 'MagnusFan', blackName: 'other' }, ' magnusfan ')).toBe('white');
    expect(playerSide({ whiteName: 'other', blackName: 'MagnusFan' }, 'MAGNUSFAN')).toBe('black');
    expect(playerSide({ whiteName: 'a', blackName: null }, 'b')).toBeNull();
  });
});

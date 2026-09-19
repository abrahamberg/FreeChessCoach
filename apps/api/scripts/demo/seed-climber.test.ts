import { describe, expect, it } from 'vitest';
import { CLIMBER_TOTAL_GAMES, liveGameCount } from './seed-climber.js';

describe('liveGameCount', () => {
  it('keeps everything until the library cap is hit', () => {
    expect(liveGameCount(400)).toBe(400);
    expect(liveGameCount(1000)).toBe(1000);
  });

  it('drops the 50 earliest each time an import would pass the cap', () => {
    expect(liveGameCount(1001)).toBe(951);
    expect(liveGameCount(1050)).toBe(1000);
    expect(liveGameCount(1051)).toBe(951);
  });

  it('leaves 970 games in the library after 3,420 imports', () => {
    expect(liveGameCount(CLIMBER_TOTAL_GAMES)).toBe(970);
  });
});

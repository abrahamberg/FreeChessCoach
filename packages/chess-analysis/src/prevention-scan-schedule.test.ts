import { describe, expect, test } from 'vitest';
import { PV_SCAN_MAX_DEPTH, scanDepthForRank } from './prevention-scan-schedule.js';

describe('scanDepthForRank', () => {
  test('multiPv=5 matches the user-proposed schedule exactly', () => {
    expect([0, 1, 2, 3, 4].map((rank) => scanDepthForRank(rank, 5))).toEqual([7, 5, 3, 1, 1]);
  });

  test('multiPv=3 tapers to the floor', () => {
    expect([0, 1, 2].map((rank) => scanDepthForRank(rank, 3))).toEqual([3, 1, 1]);
  });

  test('never returns less than 1 even for a rank far past multiPv', () => {
    expect(scanDepthForRank(10, 3)).toBe(1);
  });

  test('never exceeds PV_SCAN_MAX_DEPTH even for a very large multiPv', () => {
    expect(scanDepthForRank(0, 50)).toBe(PV_SCAN_MAX_DEPTH);
  });

  test('defaults multiPv to ENGINE_MULTI_PV (5) when omitted', () => {
    expect(scanDepthForRank(0)).toBe(7);
  });
});

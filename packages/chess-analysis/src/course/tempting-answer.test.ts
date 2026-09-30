import type { EngineLine } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { notTheAnswer } from './tempting.js';

const line = (cp: number | null, mateIn: number | null = null): EngineLine => ({ moveSan: 'x', cp, mateIn, pvSan: [] }) as unknown as EngineLine;

describe('why a working move is not the answer', () => {
  test('decided from the engine lines, for either side', () => {
    expect(notTheAnswer('white', line(null, 3), line(null, 4))).toContain('mates too');
    expect(notTheAnswer('black', line(null, -3), line(null, -4))).toContain('mates too');
    expect(notTheAnswer('white', line(null, 3), line(300))).toContain('no mate');
    expect(notTheAnswer('white', line(900), line(300))).toContain('answer is stronger');
  });

  test('null when the move no longer stands better, or hands the other side a mate', () => {
    expect(notTheAnswer('white', line(900), line(20))).toBeNull();
    expect(notTheAnswer('white', line(900), line(-300))).toBeNull();
    expect(notTheAnswer('white', line(900), line(null, -2))).toBeNull();
  });
});

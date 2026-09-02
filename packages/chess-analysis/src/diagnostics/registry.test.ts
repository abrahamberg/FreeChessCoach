import { describe, expect, test } from 'vitest';
import { DIAGNOSTIC_DETECTORS } from './registry.js';

describe('DIAGNOSTIC_DETECTORS', () => {
  test('is sorted ascending by priority', () => {
    const priorities = DIAGNOSTIC_DETECTORS.map((detector) => detector.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });

  test('has no duplicate code+direction pairs', () => {
    const keys = DIAGNOSTIC_DETECTORS.map((detector) => `${detector.code}.${detector.direction}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

import { TACTIC_MOTIF_TYPES } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { TACTIC_DETECTORS, TACTIC_DETECTOR_PRIORITY } from './registry.js';

describe('TACTIC_DETECTORS', () => {
  test('is sorted ascending by priority', () => {
    const priorities = TACTIC_DETECTORS.map((detector) => detector.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });

  test('registers each motif type at most once', () => {
    const types = TACTIC_DETECTORS.map((detector) => detector.type);
    expect(new Set(types).size).toBe(types.length);
  });

  test('never registers a motif the classifier answers for itself', () => {
    // checkmate/brilliantSacrifice come from the move's own quality and
    // `other` is the catch-all — none of the three can be claimed.
    const types = TACTIC_DETECTORS.map((detector) => detector.type) as string[];
    expect(types).not.toContain('checkmate');
    expect(types).not.toContain('brilliantSacrifice');
    expect(types).not.toContain('other');
  });

  test('only registers motifs the shared catalogue knows about', () => {
    for (const detector of TACTIC_DETECTORS) {
      expect(TACTIC_MOTIF_TYPES, `${detector.type} is not in TACTIC_MOTIF_TYPES`).toContain(detector.type);
    }
  });

  test('exposes every registered detector in the priority lookup the ranker tie-breaks on', () => {
    for (const detector of TACTIC_DETECTORS) {
      expect(TACTIC_DETECTOR_PRIORITY[detector.type]).toBe(detector.priority);
    }
  });
});

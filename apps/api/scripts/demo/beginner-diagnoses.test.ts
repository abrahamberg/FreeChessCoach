import { DIAGNOSIS_CODES_BY_ID } from '@freechesscoach/shared';
import { describe, expect, it } from 'vitest';
import { BEGINNER_FOCUS_AREAS, BEGINNER_PROFILE } from './beginner-diagnoses.js';

describe('beginner diagnoses', () => {
  it('uses only real catalog codes, in a direction the catalog allows', () => {
    for (const entry of BEGINNER_PROFILE) {
      const code = DIAGNOSIS_CODES_BY_ID.get(entry.code);
      expect(code, entry.code).toBeDefined();
      expect(code!.directions, entry.code).toContain(entry.direction);
    }
  });

  it('files every focus area under its code\'s own category, and stays a player in the 800s', () => {
    for (const area of BEGINNER_FOCUS_AREAS) {
      const code = DIAGNOSIS_CODES_BY_ID.get(area.code);
      expect(code, area.code).toBeDefined();
      expect(code!.parentCategory, area.code).toBe(area.category);
      expect(code!.ratingPrior[0], area.code).toBeLessThanOrEqual(900);
    }
  });

  it('respects the app\'s rules: at most 3 active areas, exactly one primary, and it is active', () => {
    expect(BEGINNER_FOCUS_AREAS.filter((area) => area.status === 'active').length).toBeLessThanOrEqual(3);
    const primaries = BEGINNER_FOCUS_AREAS.filter((area) => area.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]!.status).toBe('active');
  });

  it('shows the honest range of confidence, including one not-yet-enough-evidence entry', () => {
    expect(new Set(BEGINNER_PROFILE.map((entry) => entry.confidence))).toEqual(new Set(['probable', 'signal', 'insufficient']));
  });
});

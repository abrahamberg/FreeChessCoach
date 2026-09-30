import { statSync } from 'node:fs';
import { COURSE_KINDS } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { loadGoldenSet } from '../../../test/fixtures/courses/golden-set.js';
import { draftFromIntake } from './course-drafts.js';

describe('course golden set', () => {
  test('every kind, each file named for its kind, a legal PGN with a learner side, under 5 KB', () => {
    const golden = loadGoldenSet();

    expect(new Set(golden.map((course) => course.kind))).toEqual(new Set(COURSE_KINDS));
    for (const course of golden) {
      expect(course.name.startsWith(`${course.kind}-`)).toBe(true);
      expect(['white', 'black']).toContain(draftFromIntake(course.intake).learnerSide);
      expect(statSync(new URL(`../../../test/fixtures/courses/${course.name}.json`, import.meta.url)).size).toBeLessThan(5000);
    }
  });

  test('the learner side code infers for the originals', () => {
    const sides = Object.fromEntries(loadGoldenSet().map((course) => [course.name, draftFromIntake(course.intake).learnerSide]));

    expect(sides).toMatchObject({ 'trap-englund': 'black', 'opening-london': 'white', 'tactics-quick-mates': 'white', 'puzzle-smothered-two': 'white', 'master_game-opera': 'white', 'endgame-lucena': 'white' });
  });
});

import { statSync } from 'node:fs';
import { COURSE_KINDS } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { loadGoldenSet } from '../../../test/fixtures/courses/golden-set.js';
import { draftFromIntake } from '../courses.js';

describe('course golden set', () => {
  test('one intake per kind, each a legal PGN with a learner side, each under 5 KB', () => {
    const golden = loadGoldenSet();

    expect(golden.map((course) => course.name).sort()).toEqual([...COURSE_KINDS].sort());
    const sides = Object.fromEntries(golden.map((course) => [course.name, draftFromIntake(course.intake).learnerSide]));
    expect(sides).toEqual({ trap: 'black', opening: 'white', tactics: 'white', puzzle: 'white', master_game: 'white', endgame: 'white' });
    for (const course of golden) {
      expect(statSync(new URL(`../../../test/fixtures/courses/${course.name}.json`, import.meta.url)).size).toBeLessThan(5000);
    }
  });
});

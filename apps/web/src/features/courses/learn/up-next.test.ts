import type { CourseCatalogItem, CourseEnrollment } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { upNext } from './up-next.js';

const lesson = (slug: string, name: string, position: number, levelBand: CourseCatalogItem['levelBand'] = 'novice') =>
  ({ slug, title: slug, levelBand, series: { name, position } }) as CourseCatalogItem;
const enrolled = (slug: string, completedAt: string | null = null) => ({ slug, title: slug, completedAt, updatedAt: '2026-10-18' }) as CourseEnrollment;

const catalogue = [lesson('a1', 'Zero', 1, 'improving'), lesson('a2', 'Zero', 2, 'improving'), lesson('b1', 'Forks', 1), lesson('b2', 'Forks', 2), lesson('b3', 'Forks', 3)];

describe('upNext', () => {
  test('a learner in no series starts the first lesson of the series at their level', () => {
    const next = upNext({ catalogue, enrollments: [], due: [], band: 'novice' });
    expect(next.todo.map((each) => [each.slug, each.action])).toEqual([['b1', 'Start the series']]);
    expect(next.coming.map((each) => each.slug)).toEqual(['b2', 'b3']);
  });

  test('review comes first, then the course in progress; the rest of the series is coming', () => {
    const next = upNext({ catalogue, enrollments: [enrolled('b1')], due: [{ slug: 'b1', title: 'b1', due: 3, sans: [] }], band: 'novice' });
    expect(next.todo.map((each) => each.action)).toEqual(['Review 3 moves']);
    expect(next.coming.map((each) => [each.slug, each.action])).toEqual([['b2', 'Next lesson'], ['b3', 'Lesson 3']]);
    expect(upNext({ catalogue, enrollments: [enrolled('b1')], due: [], band: null }).todo.map((each) => each.action)).toEqual(['Continue']);
  });
});

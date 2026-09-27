import { describe, expect, test } from 'vitest';
import { ForbiddenError } from '../../lib/errors.js';
import { requireCourseCreator } from './require-course-creator.js';

describe('requireCourseCreator', () => {
  test('throws ForbiddenError for a user without the flag', () => {
    expect(() => requireCourseCreator({ canCreateCourses: false })).toThrow(ForbiddenError);
  });

  test('passes for a user with the flag', () => {
    expect(() => requireCourseCreator({ canCreateCourses: true })).not.toThrow();
  });
});

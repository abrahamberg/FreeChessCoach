import { describe, expect, test } from 'vitest';
import { ForbiddenError } from '../../lib/errors.js';
import { requireCourseEditor } from './require-course-editor.js';

describe('requireCourseEditor', () => {
  test('throws ForbiddenError for a user without the flag', () => {
    expect(() => requireCourseEditor({ canEditCourses: false })).toThrow(ForbiddenError);
  });

  test('passes for a user with the flag', () => {
    expect(() => requireCourseEditor({ canEditCourses: true })).not.toThrow();
  });
});

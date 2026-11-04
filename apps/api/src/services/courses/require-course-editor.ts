import { ForbiddenError } from '../../lib/errors.js';

/** Every editor route calls this first (docs/courses.md §2): course editing
 * is off until a moderator switches it on with scripts/course-editor.ts.
 * Editors share every course; none belongs to one of them. */
export function requireCourseEditor(user: { canEditCourses: boolean }): void {
  if (!user.canEditCourses) throw new ForbiddenError('Course editing is not enabled for this account');
}

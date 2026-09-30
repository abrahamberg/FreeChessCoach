import { ForbiddenError } from '../../lib/errors.js';

/** Every creator route calls this first (docs/courses.md §2): course creation
 * is off until a moderator switches it on with scripts/course-creator.ts. */
export function requireCourseCreator(user: { canCreateCourses: boolean }): void {
  if (!user.canCreateCourses) throw new ForbiddenError('Course creation is not enabled for this account');
}

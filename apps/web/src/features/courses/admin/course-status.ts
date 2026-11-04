import type { CourseStatus } from '@freechesscoach/shared';

/** A course's status as the admin pages show it. */
export const COURSE_STATUS: Record<CourseStatus, { label: string; badge: string }> = {
  draft: { label: 'Draft', badge: 'badge' },
  unlisted: { label: 'Unlisted', badge: 'badge badge--info' },
  public: { label: 'Public', badge: 'badge badge--primary' },
  removed: { label: 'Removed', badge: 'badge badge--danger' }
};

export function isPublished(status: CourseStatus): boolean {
  return status === 'unlisted' || status === 'public';
}

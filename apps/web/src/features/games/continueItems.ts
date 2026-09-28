import type { CourseEnrollment, GameListItem } from '@freechesscoach/shared';

export type ContinueItem = { kind: 'game'; game: GameListItem; at: string } | { kind: 'course'; course: CourseEnrollment; at: string };

/** The Continue rail: open game sessions (by when they started) and
 * unfinished courses (by when they were last played), most recent first. */
export function continueItems(games: readonly GameListItem[], courses: readonly CourseEnrollment[]): ContinueItem[] {
  return [
    ...games.map((game): ContinueItem => ({ kind: 'game', game, at: game.sessionStartedAt ?? game.createdAt })),
    ...courses.filter((course) => course.completedAt === null).map((course): ContinueItem => ({ kind: 'course', course, at: course.updatedAt }))
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

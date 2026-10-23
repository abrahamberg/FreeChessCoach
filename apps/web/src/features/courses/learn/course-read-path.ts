/** docs/courses.md §9: where the player and the catalogue read courses.
 * Signed in, the learner's routes, which add the members-only courses they
 * may open; signed out, the public ones. */
export function courseReadPath(signedIn: boolean): string {
  return signedIn ? '/api/learn/courses' : '/api/public/courses';
}

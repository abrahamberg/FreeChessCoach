/** Pages a brand-new account may see before the welcome flow: the welcome
 * flow itself, and the save of a free review with the saved review it opens
 * (a visitor who signed in to keep a game sees that game first; the welcome
 * flow follows on the next page). */
export function onboardingCanWait(pathname: string): boolean {
  return pathname === '/welcome' || pathname === '/save-review' || /^\/review\/[^/]+$/.test(pathname);
}

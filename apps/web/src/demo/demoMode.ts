/** The public live demo runs the real app at /demo/* on recorded sample data. */
export const DEMO_BASENAME = '/demo';

export function isDemoPath(pathname: string): boolean {
  return pathname === DEMO_BASENAME || pathname.startsWith(`${DEMO_BASENAME}/`);
}

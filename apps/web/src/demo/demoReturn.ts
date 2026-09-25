const RETURN_KEY = 'freechesscoach-demo-return';
const RETURN_PARAM = 'back';

/** Where the demo's banner should send someone back to. The welcome flow opens the
 * demo with `?back=welcome`; the demo is a full page load, so the parameter is kept
 * in sessionStorage to survive its in-app navigation. Only this one destination is
 * ever honoured, never an address taken from the URL. */
export function readDemoReturn(search: string): string | null {
  try {
    if (new URLSearchParams(search).get(RETURN_PARAM) === 'welcome') sessionStorage.setItem(RETURN_KEY, '1');
    return sessionStorage.getItem(RETURN_KEY) === '1' ? '/welcome?step=tour' : null;
  } catch {
    return null;
  }
}

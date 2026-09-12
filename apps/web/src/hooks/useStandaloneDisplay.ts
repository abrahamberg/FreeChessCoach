import { useEffect, useState } from 'react';

const STANDALONE_QUERY = '(display-mode: standalone)';

/** iOS Safari never matches `display-mode: standalone` even from a
 * home-screen launch — it sets `navigator.standalone` instead (not in the
 * lib.dom typings, hence the cast). Android/Chrome/desktop installs are
 * exactly what the media query is for. */
function isStandaloneNow(): boolean {
  return window.matchMedia(STANDALONE_QUERY).matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** Whether the app is currently running installed/full-screen (a PWA launch)
 * rather than a normal browser tab — the gate FullscreenPrompt uses to stay
 * silent once the student has already gone full screen. */
export function useStandaloneDisplay(): boolean {
  const [isStandalone, setIsStandalone] = useState(isStandaloneNow);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(STANDALONE_QUERY);
    const handleChange = () => setIsStandalone(isStandaloneNow());
    mediaQueryList.addEventListener('change', handleChange);
    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, []);

  return isStandalone;
}

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'freechesscoach-move-sounds';
const CHANGE_EVENT = 'freechesscoach-move-sounds-change';

/** Settings > Board's "Move sounds": per device, like the legal-move dots.
 * On unless turned off; blocked storage leaves it on. */
export function readMoveSoundsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function useMoveSounds(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribe, readMoveSoundsEnabled, () => true);
  const setValue = useCallback((next: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Blocked storage: the choice lasts for this page only.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [value, setValue];
}

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'freechesscoach-show-legal-move-dots';
const CHANGE_EVENT = 'freechesscoach-show-legal-move-dots-change';

function readValue(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== 'false';
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

/** Settings > Board's "show legal moves" toggle — a pure client display
 * preference (localStorage, like the theme toggle), not synced to the
 * server. Defaults to on. useSyncExternalStore (not local state) so a change
 * made in Settings is reflected immediately by any board already mounted
 * elsewhere in the tree. */
export function useShowLegalMoveDots(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribe, readValue, () => true);
  const setValue = useCallback((next: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [value, setValue];
}

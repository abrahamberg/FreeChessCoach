import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'freechesscoach-show-status-bar';
const CHANGE_EVENT = 'freechesscoach-show-status-bar-change';

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

/** The bot session page's options menu "show/hide status bar" toggle — a
 * pure client display preference (localStorage, like useShowLegalMoveDots),
 * not synced to the server. Defaults to on. */
export function useShowStatusBar(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribe, readValue, () => true);
  const setValue = useCallback((next: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [value, setValue];
}

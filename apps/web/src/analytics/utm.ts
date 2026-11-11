const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
const STORAGE_KEY = 'fcc:utm';

export type UtmParams = Partial<Record<(typeof UTM_KEYS)[number], string>>;

function readFromSearch(search: string): UtmParams {
  const query = new URLSearchParams(search);
  const found: UtmParams = {};
  for (const key of UTM_KEYS) {
    const value = query.get(key);
    if (value) found[key] = value.slice(0, 100);
  }
  return found;
}

function readStored(storage: Storage): UtmParams {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UtmParams) : {};
  } catch {
    return {};
  }
}

/** Keeps the utm tags of the first page of the visit (one browser tab session)
 * so later events carry them after the address has changed. A first page with
 * no tags stores nothing, so a tagged page opened later in the same visit is
 * not mistaken for the visit's first touch. */
export function captureUtm(search: string, storage: Storage | undefined = safeSessionStorage()): void {
  if (!storage) return;
  try {
    if (storage.getItem(STORAGE_KEY) !== null) return;
    storage.setItem(STORAGE_KEY, JSON.stringify(readFromSearch(search)));
  } catch {
    // Storage blocked: events go out without tags.
  }
}

export function getVisitUtm(storage: Storage | undefined = safeSessionStorage()): UtmParams {
  return storage ? readStored(storage) : {};
}

function safeSessionStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

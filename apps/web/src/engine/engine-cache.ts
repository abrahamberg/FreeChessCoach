// Mirrors public/engine-sw.js: the service worker keeps the full-net engine in
// a `stockfish-engine-v<N>` Cache Storage bucket the first time anything
// fetches it. Matched by prefix, not the exact name — the SW bumps <N> on a
// Stockfish upgrade (and deletes older buckets), and a hard-coded copy of the
// name here once went stale and reported "not downloaded" on every reload.
const ENGINE_CACHE_PREFIX = 'stockfish-engine-';

/** True when the full engine's wasm is already stored on this device. */
export async function isEngineCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const names = (await caches.keys()).filter((name) => name.startsWith(ENGINE_CACHE_PREFIX));
    for (const name of names) {
      const keys = await (await caches.open(name)).keys();
      if (keys.some((request) => request.url.includes('stockfish-19-single') && request.url.endsWith('.wasm'))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Mirrors public/engine-sw.js: the service worker keeps the full-net engine in
// this Cache Storage bucket the first time anything fetches it.
const ENGINE_CACHE_NAME = 'stockfish-engine-v2';

/** True when the full engine's wasm is already stored on this device. */
export async function isEngineCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(ENGINE_CACHE_NAME);
    const keys = await cache.keys();
    return keys.some((request) => request.url.includes('stockfish-19-single') && request.url.endsWith('.wasm'));
  } catch {
    return false;
  }
}

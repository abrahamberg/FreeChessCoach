// Caches the WASM Stockfish binary (and its loader script) in the Cache
// Storage API. Plain HTTP caching doesn't stick for the full-net build's
// ~108MB .wasm: verified in a real tab that back-to-back fetch() calls for
// it both report the full transferSize (a genuine re-download), while the
// same test against the ~7MB lite build gets served from the HTTP cache on
// the second call (transferSize 300, a 304). The full build is over
// Chrome's disk-cache per-entry size limit even though the dev/prod servers
// both send a matching ETag; Cache Storage has no such limit.
//
// Matches by filename rather than full path because the path differs
// between the Vite dev server (/@fs/<abs-path>/stockfish-18-single.wasm)
// and the production build (content-hashed, e.g.
// /assets/stockfish-18-single-<hash>.wasm) — the hashed prod filename
// busts this cache automatically on a dependency bump, so only the dev
// path needs the manual CACHE_NAME bump below.
// v2: an earlier CACHE_NAME=v1 rollout landed before the dev server actually
// had the engine files staged (see copy-stockfish-assets.mjs) — Vite's
// SPA-fallback HTML (still a 200, so it passed the old `response.ok` check
// below) got cached as if it were the real engine file, permanently breaking
// the engine for anyone who loaded the app in that window, immune to any
// later server-side fix since this cache never expires or revalidates on its
// own. Bump this whenever that class of bad response might have been cached.
const CACHE_NAME = 'stockfish-engine-v2'; // bump when the `stockfish` npm package version changes

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((names) =>
          Promise.all(
            names.filter((name) => name.startsWith('stockfish-engine-') && name !== CACHE_NAME).map((name) => caches.delete(name))
          )
        )
    ])
  );
});

function isEngineAsset(url) {
  return url.includes('stockfish-18-single') && (url.endsWith('.wasm') || url.endsWith('.js'));
}

// Guards against repeating the v1 incident: a dev-only misconfiguration
// (Vite serving its SPA-fallback HTML for a not-yet-staged asset path) is
// still `response.ok` — a content-type check is the only thing that actually
// distinguishes a real engine file from that fallback.
function looksLikeEngineAsset(url, response) {
  const contentType = response.headers.get('content-type') ?? '';
  return url.endsWith('.wasm') ? contentType.includes('wasm') : contentType.includes('javascript');
}

self.addEventListener('fetch', (event) => {
  if (!isEngineAsset(event.request.url)) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok && looksLikeEngineAsset(event.request.url, response)) cache.put(event.request, response.clone());
      return response;
    })
  );
});

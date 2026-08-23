import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Dev-only: the SPA calls same-origin `/api/...` paths (see api/client.ts), so
// the Vite dev server needs to forward them to the real API instead of
// falling back to index.html. VITE_API_PROXY_TARGET lets docker-compose point
// this at the `api` service by container name; defaults to localhost for
// running `npm run dev` directly on the host.
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  // kokoro-js (apps/web/src/tts/kokoro-worker.ts) pulls in transformers.js,
  // which uses dynamic import() internally to load its WASM backends — Vite's
  // default worker output (iife) can't inline those, so the worker needs the
  // ESM format instead.
  worker: {
    format: 'es'
  },
  server: {
    // Cross-origin isolation lets onnxruntime-web's WASM backend run
    // Kokoro TTS multi-threaded instead of single-threaded (see
    // kokoro-worker.ts and shared-engine-worker.ts:61's opposite tradeoff for
    // Stockfish, which deliberately avoids needing this). COEP:
    // 'credentialless' rather than 'require-corp' — the only cross-origin
    // resource this app loads is the Kokoro model weights from
    // huggingface.co, fetched without credentials; 'credentialless' allows
    // that through without HF needing to send a Cross-Origin-Resource-Policy
    // header (which isn't guaranteed), whereas 'require-corp' would block it
    // silently if HF ever doesn't send one. No popup-based OAuth in this app
    // (redirect-only via oauth2-proxy) — COOP: same-origin doesn't affect it.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless'
    },
    proxy: {
      '/api': { target: apiProxyTarget, changeOrigin: true, ws: true }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: false
  }
});

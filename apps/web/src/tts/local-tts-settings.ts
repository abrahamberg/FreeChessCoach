const STORAGE_KEY = 'fcc.localTtsPort';

/** Kokoro-FastAPI's default port (the guide's Docker command publishes it). */
export const DEFAULT_LOCAL_TTS_PORT = 8880;

/** A whole number from 1 to 65535, or null. Deliberately strict: "88 80" or
 * "8880.5" are typos to be flagged, not guessed at. */
export function parseLocalTtsPort(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d{1,5}$/.test(trimmed)) return null;
  const port = Number(trimmed);
  return port >= 1 && port <= 65535 ? port : null;
}

export function localTtsBaseUrl(port: number): string {
  return `http://localhost:${port}`;
}

/** Per-device on purpose: the voice server runs on this machine, so the port
 * is meaningless on another device and doesn't belong in the DB. */
export function readLocalTtsPort(): number {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return (stored !== null && parseLocalTtsPort(stored)) || DEFAULT_LOCAL_TTS_PORT;
  } catch {
    return DEFAULT_LOCAL_TTS_PORT;
  }
}

export function writeLocalTtsPort(port: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(port));
  } catch {
    // Storage blocked (private window etc.) — the default port still works.
  }
}

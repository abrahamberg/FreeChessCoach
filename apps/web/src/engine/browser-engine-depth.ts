import { ENGINE_DEFAULT_DEPTH } from '@freechesscoach/shared';

/** Search depths the user can pick for the on-device (full-net) engine.
 * Deeper means better analysis but a slower, hotter tab — single-threaded
 * WASM roughly doubles its time per two extra plies. */
export const BROWSER_ENGINE_DEPTH_OPTIONS = [
  { depth: 10, label: 'Quick (depth 10)' },
  { depth: ENGINE_DEFAULT_DEPTH, label: `Standard (depth ${ENGINE_DEFAULT_DEPTH}) — default` },
  { depth: 14, label: 'Thorough (depth 14)' },
  { depth: 16, label: 'Deep (depth 16)' },
  { depth: 18, label: 'Very deep (depth 18) — slow' },
  { depth: 20, label: 'Maximum (depth 20) — very slow' }
] as const;

const STORAGE_KEY = 'browserEngineDepth';

/** Depth chosen on this device, or null for "whatever the server asks for". */
export function getBrowserEngineDepth(): number | null {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return BROWSER_ENGINE_DEPTH_OPTIONS.some((option) => option.depth === stored) ? stored : null;
  } catch {
    return null;
  }
}

export function setBrowserEngineDepth(depth: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(depth));
  } catch {
    // Storage unavailable (private window) — the choice just won't persist.
  }
}

/** Where the free review's positions are searched: the engine in this
 * browser, or the server's (the Lichess eval index first, then Stockfish). */
export type ReviewEngine = 'device' | 'server';

/** Why that engine: the visitor picked it, the link asked for it, the device
 * looked slow before the review or was measured slow during it, the server
 * refused (its free allowance or a failure), or the default. */
export type ReviewEngineReason = 'default' | 'chosen' | 'link' | 'slow_device' | 'slow_measured' | 'server_unavailable';

export interface ReviewEngineStatus {
  engine: ReviewEngine;
  reason: ReviewEngineReason;
}

/** What the browser tells about the device before anything runs. */
export interface DeviceSignals {
  cores?: number;
  memoryGb?: number;
  mobile?: boolean;
  saveData?: boolean;
}

/** A phone, a data saver, fewer than four cores or less than 4 GB: the
 * single-threaded engine is slow there, and its first download is ~95 MB. */
export function isSlowDevice({ cores, memoryGb, mobile, saveData }: DeviceSignals): boolean {
  if (mobile || saveData) return true;
  if (cores !== undefined && cores < 4) return true;
  return memoryGb !== undefined && memoryGb < 4;
}

interface NavigatorHints {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  userAgent?: string;
  userAgentData?: { mobile?: boolean };
  connection?: { saveData?: boolean };
}

export function readDeviceSignals(nav: NavigatorHints = navigator as NavigatorHints): DeviceSignals {
  const mobile = nav.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent ?? '');
  return { cores: nav.hardwareConcurrency, memoryGb: nav.deviceMemory, mobile, saveData: nav.connection?.saveData };
}

const STORAGE_KEY = 'fcc:free-review-engine';

export function savedReviewEngine(storage: Storage | undefined = localStore()): ReviewEngine | null {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    return value === 'device' || value === 'server' ? value : null;
  } catch {
    return null;
  }
}

export function saveReviewEngine(engine: ReviewEngine, storage: Storage | undefined = localStore()): void {
  try {
    storage?.setItem(STORAGE_KEY, engine);
  } catch {
    // Private window: the choice lasts this page only.
  }
}

/** The link's `engine=` wins (the studio's recorder pins it), then the
 * visitor's own earlier choice, then the device's look. */
export function initialReviewEngine(link: ReviewEngine | null, saved: ReviewEngine | null, signals: DeviceSignals): ReviewEngineStatus {
  if (link) return { engine: link, reason: 'link' };
  if (saved) return { engine: saved, reason: 'chosen' };
  return isSlowDevice(signals) ? { engine: 'server', reason: 'slow_device' } : { engine: 'device', reason: 'default' };
}

function localStore(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

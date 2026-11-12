import { ImportGameRequestSchema, type ImportGameRequest } from '@freechesscoach/shared';
import { importSourceOf, type ReviewOrigin } from './review-origin.js';

const STORAGE_KEY = 'fcc:free-review-save';

/** The page a signed-in visitor lands on to save the game they reviewed. */
export const SAVE_REVIEW_PATH = '/save-review';

/** Google sign-in through oauth2-proxy, coming back to the save page. */
export const SAVE_REVIEW_SIGN_IN_URL = `/oauth2/start?rd=${encodeURIComponent(SAVE_REVIEW_PATH)}`;

export interface PendingSave {
  pgn: string;
  userColor: 'white' | 'black';
  origin: ReviewOrigin;
}

/** The import request that saves this game, through the normal import path
 * (the quota applies there). */
export function saveRequestOf({ pgn, userColor, origin }: PendingSave): ImportGameRequest {
  return { pgn, userColor, source: importSourceOf(origin.source), playedAt: origin.playedAt };
}

/** Keeps the game in this tab across the sign-in round trip (oauth2-proxy and
 * Google). It stays in the visitor's own browser: nothing is sent until they
 * are signed in and the save page imports it. */
export function keepPendingSave(save: PendingSave, storage: Storage | undefined = tabStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(saveRequestOf(save)));
  } catch {
    // Storage blocked: sign-in still works, the game is just not carried over.
  }
}

/** The game waiting to be saved, or null when there is none or it does not parse. */
export function readPendingSave(storage: Storage | undefined = tabStorage()): ImportGameRequest | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = ImportGameRequestSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearPendingSave(storage: Storage | undefined = tabStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

function tabStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

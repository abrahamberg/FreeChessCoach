import { nextCourseReview, type CourseReviewState } from '@freechesscoach/chess-analysis';
import { CourseProgressItemSchema, CourseProgressResponseSchema, type CourseDrillResult, type CourseProgressItem } from '@freechesscoach/shared';
import { z } from 'zod';
import { apiPost } from '../../../api/client.js';

/** docs/courses.md §11: where a learner's drill results go. Signed in, the
 * account; otherwise this browser, moved to the account on sign-in. */
export interface CourseProgressStore {
  signedIn: boolean;
  lookup: (keys: string[]) => Promise<Map<string, CourseReviewState>>;
  record: (results: CourseDrillResult[]) => Promise<void>;
}

/** The learner's own calendar day: "due today" means their today. */
export function localToday(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const STORAGE_KEY = 'fcc.courseProgress.v1';
const StoredSchema = z.record(z.string(), CourseProgressItemSchema);

function readBrowser(): Record<string, CourseProgressItem> {
  try {
    const parsed = StoredSchema.safeParse(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}'));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function writeBrowser(items: Record<string, CourseProgressItem>): void {
  try {
    if (Object.keys(items).length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private windows and blocked storage: the drill still works, unsaved.
  }
}

function saveInBrowser(results: CourseDrillResult[]): void {
  const items = readBrowser();
  const today = localToday();
  for (const result of results) {
    const state = nextCourseReview(items[result.key] ?? null, result.correct, today);
    items[result.key] = { key: result.key, san: result.san, courseSlug: result.courseSlug, ...state, updatedAt: new Date().toISOString() };
  }
  writeBrowser(items);
}

export const browserProgressStore: CourseProgressStore = {
  signedIn: false,
  lookup: (keys) => {
    const items = readBrowser();
    return Promise.resolve(new Map(keys.flatMap((key) => (items[key] ? [[key, items[key]] as const] : []))));
  },
  record: (results) => {
    saveInBrowser(results);
    return Promise.resolve();
  }
};

export const accountProgressStore: CourseProgressStore = {
  signedIn: true,
  lookup: async (keys) => {
    const { items } = await apiPost('/api/course-progress/lookup', { keys }, CourseProgressResponseSchema);
    return new Map(items.map((item) => [item.key, item]));
  },
  record: async (results) => {
    try {
      await apiPost('/api/course-progress/drills', { today: localToday(), results }, CourseProgressResponseSchema);
    } catch {
      // Signed out meanwhile, or offline: kept here and moved over next time.
      saveInBrowser(results);
    }
  }
};

/** Whether this visitor is signed in. /learn is outside the proxy's login, so
 * ask: signed out, the proxy answers 401 to a JSON request (or redirects to
 * the sign-in page, which fetch can't follow cross-site). */
export async function isSignedIn(): Promise<boolean> {
  try {
    const response = await fetch('/api/users/me', { credentials: 'include', headers: { accept: 'application/json' } });
    return response.ok && (response.headers.get('content-type') ?? '').includes('application/json');
  } catch {
    return false;
  }
}

/** Moves what this browser kept before sign-in to the account, once. */
export async function importBrowserProgress(): Promise<void> {
  const items = Object.values(readBrowser());
  if (!items.length) return;
  const response = await fetch('/api/course-progress/import', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ items: items.slice(-2000) })
  });
  if (response.ok) writeBrowser({});
}

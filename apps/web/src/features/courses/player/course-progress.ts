import { nextCourseReview, type CourseReviewState } from '@freechesscoach/chess-analysis';
import {
  CourseEnrollmentListResponseSchema,
  CourseProgressItemSchema,
  CourseProgressResponseSchema,
  ImportCourseEnrollmentSchema,
  type CourseDrillResult,
  type CourseProgressItem,
  type ImportCourseEnrollment,
  type SaveCourseEnrollmentRequest
} from '@freechesscoach/shared';
import { z } from 'zod';
import { apiGet, apiPost, apiPut } from '../../../api/client.js';

/** docs/courses.md §11: where a learner's drill results go. Signed in, the
 * account; otherwise this browser, moved to the account on sign-in. */
export interface CourseProgressStore {
  signedIn: boolean;
  lookup: (keys: string[]) => Promise<Map<string, CourseReviewState>>;
  record: (results: CourseDrillResult[]) => Promise<void>;
  /** Where the learner is in a course (§11), null when not started. */
  loadEnrollment: (slug: string) => Promise<SaveCourseEnrollmentRequest | null>;
  saveEnrollment: (slug: string, enrollment: SaveCourseEnrollmentRequest) => Promise<void>;
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

const ENROLLMENTS_KEY = 'fcc.courseEnrollments.v1';
const StoredEnrollmentsSchema = z.record(z.string(), ImportCourseEnrollmentSchema);

function readBrowserEnrollments(): Record<string, ImportCourseEnrollment> {
  try {
    const parsed = StoredEnrollmentsSchema.safeParse(JSON.parse(window.localStorage.getItem(ENROLLMENTS_KEY) ?? '{}'));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function writeBrowserEnrollments(enrollments: Record<string, ImportCourseEnrollment>): void {
  try {
    if (Object.keys(enrollments).length) window.localStorage.setItem(ENROLLMENTS_KEY, JSON.stringify(enrollments));
    else window.localStorage.removeItem(ENROLLMENTS_KEY);
  } catch {
    // Blocked storage: the course still plays, its place unsaved.
  }
}

function saveEnrollmentInBrowser(slug: string, enrollment: SaveCourseEnrollmentRequest): void {
  writeBrowserEnrollments({ ...readBrowserEnrollments(), [slug]: { ...enrollment, slug, updatedAt: new Date().toISOString() } });
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
  },
  loadEnrollment: (slug) => Promise.resolve(readBrowserEnrollments()[slug] ?? null),
  saveEnrollment: (slug, enrollment) => {
    saveEnrollmentInBrowser(slug, enrollment);
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
  },
  loadEnrollment: async (slug) => {
    const { items } = await apiGet('/api/course-enrollments', CourseEnrollmentListResponseSchema);
    const found = items.find((item) => item.slug === slug);
    return found ? { stage: found.stage, place: found.place, stagesDone: found.stagesDone } : null;
  },
  saveEnrollment: async (slug, enrollment) => {
    try {
      await apiPut(`/api/course-enrollments/${encodeURIComponent(slug)}`, enrollment);
    } catch {
      saveEnrollmentInBrowser(slug, enrollment);
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

/** Moves what this browser kept before sign-in to the account, once: the
 * review schedule and the courses being learned. */
export async function importBrowserProgress(): Promise<void> {
  const items = Object.values(readBrowser());
  const enrollments = Object.values(readBrowserEnrollments());
  if (!items.length && !enrollments.length) return;
  const response = await fetch('/api/course-progress/import', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ items: items.slice(-2000), enrollments: enrollments.slice(-200) })
  });
  if (response.ok) {
    writeBrowser({});
    writeBrowserEnrollments({});
  }
}

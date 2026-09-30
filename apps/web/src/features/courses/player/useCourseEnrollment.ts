import type { SaveCourseEnrollmentRequest } from '@freechesscoach/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CourseProgressStore } from './course-progress.js';

/** Wait before saving the place, so a run of moves is one write. */
const SAVE_DELAY_MS = 1000;

export interface CourseEnrollmentHandle {
  /** undefined while loading; null when the course was never started. */
  saved: SaveCourseEnrollmentRequest | null | undefined;
  /** Saves after a short pause; the last one is flushed on leaving. */
  save: (enrollment: SaveCourseEnrollmentRequest) => void;
}

/**
 * docs/courses.md §11: where the learner is in this course, so they can
 * leave and come back. Signed in it lives on the account, signed out in this
 * browser. With no store (the editor's preview) nothing loads or saves.
 */
export function useCourseEnrollment(slug: string | undefined, store: CourseProgressStore | null | undefined): CourseEnrollmentHandle {
  const [saved, setSaved] = useState<SaveCourseEnrollmentRequest | null | undefined>(undefined);
  const pendingRef = useRef<{ slug: string; store: CourseProgressStore; enrollment: SaveCourseEnrollmentRequest } | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!slug || !store) return;
    let live = true;
    void store
      .loadEnrollment(slug)
      .catch(() => null)
      .then((found) => live && setSaved(found));
    return () => {
      live = false;
    };
  }, [slug, store]);

  const flush = useCallback(() => {
    window.clearTimeout(timerRef.current);
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) void pending.store.saveEnrollment(pending.slug, pending.enrollment).catch(() => undefined);
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  const save = useCallback(
    (enrollment: SaveCourseEnrollmentRequest) => {
      if (!slug || !store) return;
      pendingRef.current = { slug, store, enrollment };
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(flush, SAVE_DELAY_MS);
    },
    [slug, store, flush]
  );

  return { saved, save };
}

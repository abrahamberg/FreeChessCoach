import type { CourseCatalogItem, CourseEnrollment, CourseReviewDueResponse, RatingBand } from '@freechesscoach/shared';

/** One line of the Courses page's "Up next". */
export interface UpNextItem {
  slug: string;
  title: string;
  /** What to do with it: "Review 3 moves", "Continue", "Start the series", "Lesson 4 of 14". */
  action: string;
}

export interface UpNext {
  /** What the learner needs to do now. */
  todo: UpNextItem[];
  /** The courses coming after it. */
  coming: UpNextItem[];
}

/** How many courses "coming" lists. */
const COMING = 3;

/** docs/courses.md §9: the top of `/learn`. To do: the course with the most
 * moves due for review, and the unfinished course touched last, else the next
 * lesson of the series the learner is in. Coming: the lessons of that series
 * still to start. A learner in no series gets the first lesson of a series at
 * their own level (else the first series there is). `catalogue` is in
 * curriculum order. */
export function upNext(input: {
  catalogue: readonly CourseCatalogItem[];
  enrollments: readonly CourseEnrollment[];
  due: CourseReviewDueResponse['courses'];
  band: RatingBand | null;
}): UpNext {
  const { catalogue, enrollments, due, band } = input;
  const started = new Set(enrollments.map((each) => each.slug));
  const todo: UpNextItem[] = [];

  const mostDue = [...due].sort((a, b) => b.due - a.due)[0];
  if (mostDue) todo.push({ slug: mostDue.slug, title: mostDue.title, action: mostDue.due === 1 ? 'Review 1 move' : `Review ${mostDue.due} moves` });
  const unfinished = enrollments.filter((each) => each.completedAt === null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (unfinished && unfinished.slug !== mostDue?.slug) todo.push({ slug: unfinished.slug, title: unfinished.title, action: 'Continue' });

  const bySlug = new Map(catalogue.map((each) => [each.slug, each]));
  const current = [...enrollments].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((each) => bySlug.get(each.slug)?.series?.name).find((name) => name !== undefined);
  const lessons = (name: string) =>
    catalogue.filter((each) => each.series?.name === name && !started.has(each.slug)).sort((a, b) => (a.series?.position ?? 0) - (b.series?.position ?? 0));

  let upcoming: CourseCatalogItem[];
  let first: string;
  if (current) {
    upcoming = lessons(current);
    first = 'Next lesson';
  } else {
    const names = [...new Set(catalogue.flatMap((each) => (each.series ? [each.series.name] : [])))];
    const atLevel = names.find((name) => lessons(name)[0]?.levelBand === band) ?? names.find((name) => lessons(name).length > 0);
    upcoming = atLevel ? lessons(atLevel) : [];
    first = 'Start the series';
  }
  const coming = upcoming.slice(0, COMING).map((each, index): UpNextItem => ({
    slug: each.slug,
    title: each.title,
    action: index === 0 ? first : each.series ? `Lesson ${each.series.position}` : ''
  }));

  // Nothing to do yet: the first coming course is the thing to do.
  if (!todo.length && coming[0]) return { todo: [coming[0]], coming: coming.slice(1) };
  return { todo, coming };
}

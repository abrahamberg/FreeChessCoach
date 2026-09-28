import type { CourseLevel } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import type { CatalogueSort } from './useCourseCatalogue.js';

/** Level, then place; courses with no level last (Phase 90's curriculum). */
export function byCurriculum<T extends { level: CourseLevel | null }>(items: readonly T[]): T[] {
  const key = (item: T): [number, number] => (item.level ? [item.level.rating, item.level.order] : [Number.MAX_SAFE_INTEGER, 0]);
  return [...items].sort((a, b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1]);
}

/** Courses in curriculum order, grouped under their level. */
export function levelGroups<T extends { level: CourseLevel | null }>(items: readonly T[]): { rating: number | null; items: T[] }[] {
  const groups: { rating: number | null; items: T[] }[] = [];
  for (const item of byCurriculum(items)) {
    const rating = item.level?.rating ?? null;
    const last = groups.at(-1);
    if (last && last.rating === rating) last.items.push(item);
    else groups.push({ rating, items: [item] });
  }
  return groups;
}

export function SortControl({ value, onChange }: { value: CatalogueSort; onChange: (sort: CatalogueSort) => void }): ReactNode {
  return (
    <div className="courses-home__sort" role="group" aria-label="Sort">
      <span className="meta">Sort</span>
      {(['curriculum', 'newest'] as const).map((option) => (
        <button key={option} type="button" className="courses-home__filter" aria-pressed={value === option} onClick={() => onChange(option)}>
          {option === 'curriculum' ? 'Curriculum' : 'Newest'}
        </button>
      ))}
    </div>
  );
}

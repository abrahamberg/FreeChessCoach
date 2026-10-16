import type { CourseSeries } from '@freechesscoach/shared';

/** A series' lessons in order, under their module headings (in the order the
 * modules first appear). */
export interface SeriesSection<T> {
  name: string;
  modules: { module: string | null; items: T[] }[];
}

/** The courses in a series, split from the rest: one section per series, its
 * lessons by position, grouped under their modules. Series come in the order
 * of their first lesson in `items`. */
export function splitSeries<T extends { series: CourseSeries | null }>(items: readonly T[]): { sections: SeriesSection<T>[]; others: T[] } {
  const bySeries = new Map<string, (T & { series: CourseSeries })[]>();
  const others: T[] = [];
  for (const item of items) {
    const { series } = item;
    if (!series) others.push(item);
    else bySeries.set(series.name, [...(bySeries.get(series.name) ?? []), { ...item, series }]);
  }
  const sections = [...bySeries].map(([name, lessons]): SeriesSection<T> => {
    const ordered = [...lessons].sort((a, b) => a.series.position - b.series.position);
    const modules: SeriesSection<T>['modules'] = [];
    for (const lesson of ordered) {
      const module = lesson.series.module ?? null;
      const last = modules.at(-1);
      if (last && last.module === module) last.items.push(lesson);
      else modules.push({ module, items: [lesson] });
    }
    return { name, modules };
  });
  return { sections, others };
}

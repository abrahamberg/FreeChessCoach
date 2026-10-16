import { describe, expect, test } from 'vitest';
import { splitSeries } from './series-sections.js';

const lesson = (slug: string, series: { name: string; position: number; module?: string } | null) => ({ slug, series });

describe('splitSeries', () => {
  test('puts a series’ lessons in order, under their modules, and leaves the other courses alone', () => {
    const { sections, others } = splitSeries([
      lesson('l7', { name: 'Chess From Zero', position: 7, module: 'Tactics' }),
      lesson('trap', null),
      lesson('l1', { name: 'Chess From Zero', position: 1, module: 'The pieces' }),
      lesson('l2', { name: 'Chess From Zero', position: 2, module: 'The pieces' })
    ]);

    expect(others.map((course) => course.slug)).toEqual(['trap']);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.modules.map((group) => [group.module, group.items.map((course) => course.slug)])).toEqual([
      ['The pieces', ['l1', 'l2']],
      ['Tactics', ['l7']]
    ]);
  });
});

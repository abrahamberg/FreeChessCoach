import type { CourseDocument } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { drillLine, lineChange, lineProgress, placeLabel } from './drill-line.js';

const document = {
  chapters: [
    { id: 'c1', title: 'The idea', lineId: 'l1', episodeIds: ['e1', 'e2'] },
    { id: 'c2', title: 'Greedy', lineId: 'l2', episodeIds: ['e3'] }
  ],
  lines: [
    { id: 'l1', name: 'Main', note: null, leafNodeId: 'n1' },
    { id: 'l2', name: 'Greedy', note: 'why 7... dxc3 is too greedy', leafNodeId: 'n2' }
  ]
} as unknown as CourseDocument;

describe('drillLine', () => {
  test('names the chapter and carries the line note', () => {
    expect(drillLine(document, 'e2')).toEqual({ title: 'The idea', note: null });
    expect(drillLine(document, 'e3')).toEqual({ title: 'Greedy', note: 'why 7... dxc3 is too greedy' });
    expect(drillLine(document, 'x')).toBeNull();
  });
});

describe('lineChange', () => {
  test('the first line is only "now"; a new line says what was finished', () => {
    const idea = { title: 'The idea', note: null };
    const greedy = { title: 'Greedy', note: null };
    expect(lineChange(null, idea)).toEqual({ done: null, now: 'The idea' });
    expect(lineChange(idea, greedy)).toEqual({ done: 'The idea', now: 'Greedy' });
    expect(lineChange(idea, idea)).toBeNull();
    expect(lineChange(idea, null)).toBeNull();
  });
});

describe('lineProgress', () => {
  const steps = (...asked: boolean[]) => asked.map((each) => ({ asked: each }));
  const episodes = [
    { episodeId: 'e1', steps: steps(true, false, true) },
    { episodeId: 'e2', steps: steps(true) },
    { episodeId: 'e3', steps: steps(false, true, true) }
  ];

  test('counts my moves played per line; episodes of one chapter join', () => {
    expect(lineProgress(document, episodes, { episode: 1, step: 0 })).toEqual([
      { title: 'The idea', done: 2, total: 3, current: true },
      { title: 'Greedy', done: 0, total: 2, current: false }
    ]);
    expect(lineProgress(document, episodes, { episode: 2, step: 2 })).toEqual([
      { title: 'The idea', done: 3, total: 3, current: false },
      { title: 'Greedy', done: 1, total: 2, current: true }
    ]);
  });
});

describe('placeLabel', () => {
  test('the line, and the move reached once there is one', () => {
    expect(placeLabel(document, 'e3', 0)).toBe('Greedy');
    expect(placeLabel(document, 'e3', 3)).toBe('Greedy · move 3');
    expect(placeLabel(document, 'x', 3)).toBeNull();
  });
});

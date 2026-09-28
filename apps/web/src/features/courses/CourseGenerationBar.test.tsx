import type { CourseGeneration, CourseResponse } from '@freechesscoach/shared';
import { parseCourseTree } from '@freechesscoach/chess-analysis';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CourseGenerationBar } from './CourseGenerationBar.js';

const tree = parseCourseTree('1. e4 e5 *');
const generation: CourseGeneration = { status: 'running', step: 'Writing episode 3 of 5', done: 2, total: 5, error: null, outline: null, finishedEpisodeIds: [], warnings: [] };
const course = (next: CourseGeneration | null): CourseResponse => ({
  id: 'c1', slug: 's', kind: 'trap', status: 'draft', title: 't', direction: '', updatedAt: '2026-09-28T00:00:00Z', publishedAt: null, missingNoteAudio: [], evals: {}, generation: next,
  document: {
    version: 1, kind: 'trap', title: 't', promise: '', learnerSide: 'black', levelBand: 'novice', coachPersona: 'general',
    startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], episodes: [], takeaways: [], hookOptions: [], clipLinks: {}
  }
});

function renderBar(next: CourseGeneration | null, dirty = false) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CourseGenerationBar course={course(next)} dirty={dirty} />
    </QueryClientProvider>
  );
}

describe('CourseGenerationBar', () => {
  test('shows the step while running, and no second start', () => {
    renderBar(generation);

    expect(screen.getByRole('status').textContent).toBe('Writing episode 3 of 5 (2 of 5 done)');
    expect(screen.queryByRole('button', { name: 'Write with AI' })).toBeNull();
  });

  test('a written course starts over from the editor’s menu, not here', () => {
    const written = course(null);
    written.document.episodes = [{ id: 'e1', role: 'setup', focus: '', startNodeId: 'n1', endNodeId: 'n1', plies: [], drillNodeIds: [] }];
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CourseGenerationBar course={written} dirty={false} />
      </QueryClientProvider>
    );
    expect(screen.queryByRole('button', { name: 'Write with AI' })).toBeNull();
  });

  test('a failed run with an outline shows its error and offers to resume', () => {
    const outline = { title: 't', promise: '', hookOptions: ['a', 'b', 'c'], takeaways: ['a', 'b', 'c'], video: null, reel: null, chapters: [] };
    renderBar({ ...generation, status: 'failed', step: null, error: 'Unlock your AI setup in Settings.', outline });

    expect(screen.getByRole('alert').textContent).toBe('Unlock your AI setup in Settings.');
    expect(screen.getByRole('button', { name: 'Resume writing' })).toBeTruthy();
  });

  test('unsaved edits must be saved first', () => {
    renderBar(null, true);

    expect(screen.getByRole('button', { name: 'Write with AI' }).getAttribute('title')).toBe('Save your changes first');
  });
});

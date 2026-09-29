import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseResponse } from '@freechesscoach/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CourseEditorPage } from './CourseEditorPage.js';

// The page's state is under test, not the board (which needs a real layout).
vi.mock('../board/CoachBoard.js', () => ({ CoachBoard: () => null }));

const tree = parseCourseTree('1. d4 e5 2. dxe5 Nc6 *');
const ids = tree.nodes.map((node) => node.id);
const document: CourseDocument = {
  version: 1, kind: 'trap', title: 'T', promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'commander',
  startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [{ id: 'c1', title: 'The trap', lineId: 'l1', episodeIds: ['e1', 'e2'] }],
  episodes: [
    { id: 'e1', role: 'bait', focus: 'Take the pawn.', startNodeId: ids[0]!, endNodeId: ids[1]!, drillNodeIds: [], plies: [] },
    { id: 'e2', role: 'punish', focus: 'The queen comes out.', startNodeId: ids[2]!, endNodeId: ids[3]!, drillNodeIds: [], plies: [] }
  ],
  takeaways: [], hookOptions: [], clipLinks: {}
};
const course: CourseResponse = {
  id: 'c1', slug: 't-aaaa', kind: 'trap', status: 'draft', title: 'T', direction: '', document, generation: null,
  updatedAt: '2026-09-29T10:00:00.000Z', publishedAt: null, missingNoteAudio: [], evals: {}
};

function renderEditor(): QueryClient {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(course), { status: 200, headers: { 'content-type': 'application/json' } }))));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/studio/c1/edit']}>
        <Routes>
          <Route path="/studio/:id/edit" element={<CourseEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return client;
}

const focus = (): HTMLTextAreaElement => screen.getByRole('textbox', { name: 'Focus' });

afterEach(() => vi.unstubAllGlobals());

describe('CourseEditorPage', () => {
  test("a newer server copy keeps the chosen episode, and never replaces unsaved edits", async () => {
    const client = renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: /punish/ }));
    expect(focus().value).toBe('The queen comes out.');

    // Not dirty: the server's copy is taken, on the same episode.
    const renamed = { ...document, episodes: document.episodes.map((episode) => (episode.id === 'e2' ? { ...episode, focus: 'From the server.' } : episode)) };
    act(() => {
      client.setQueryData(['course', 'c1'], { ...course, document: renamed, updatedAt: '2026-09-29T10:01:00.000Z' });
    });
    await waitFor(() => expect(focus().value).toBe('From the server.'));

    // Dirty: a refetch leaves the creator's edit alone.
    fireEvent.change(focus(), { target: { value: 'Mine.' } });
    act(() => {
      client.setQueryData(['course', 'c1'], { ...course, updatedAt: '2026-09-29T10:02:00.000Z' });
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(focus().value).toBe('Mine.');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });

  test('while the AI writes, the fields are locked and the list still browses', async () => {
    const client = renderEditor();
    await screen.findByRole('textbox', { name: 'Focus' });
    const generation = { status: 'running' as const, step: 'Writing episode 1 of 2', done: 0, total: 2, error: null, outline: null, finishedEpisodeIds: [], warnings: [], heartbeatAt: new Date().toISOString() };
    act(() => {
      client.setQueryData(['course', 'c1'], { ...course, generation, updatedAt: '2026-09-29T10:01:00.000Z' });
    });
    await waitFor(() => expect(focus().matches(':disabled')).toBe(true));
    // The list still browses.
    fireEvent.click(screen.getByRole('button', { name: /punish/ }));
    expect(focus().value).toBe('The queen comes out.');
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CoursesHomePage } from './CoursesHomePage.js';

const enrollment = (slug: string, title: string, completedAt: string | null) => ({
  slug,
  title,
  kind: 'trap',
  stage: completedAt ? 'full_drill' : 'practice',
  place: { episode: 0, step: 0, practice: {} },
  stagesDone: completedAt ? ['play_through', 'practice', 'drill', 'full_drill'] : ['play_through'],
  startedAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-27T10:00:00.000Z',
  completedAt
});

const catalogueItem = (slug: string, title: string, kind = 'trap') => ({
  slug,
  title,
  promise: `Learn ${title}.`,
  kind,
  levelBand: 'improving',
  coachPersona: 'commander',
  learnerSide: 'black',
  publishedAt: '2026-09-01T00:00:00.000Z',
  episodes: 3,
  moves: 12
});

interface Data {
  enrollments?: unknown[];
  catalogue?: unknown[];
  due?: unknown[];
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function renderWith({ enrollments = [], catalogue = [], due = [] }: Data) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }));
    if (url.startsWith('/api/course-enrollments')) return Promise.resolve(json({ items: enrollments }));
    if (url.startsWith('/api/public/courses')) {
      const kind = new URL(url, 'http://x').searchParams.get('kind');
      return Promise.resolve(json({ items: catalogue.filter((item) => !kind || (item as { kind: string }).kind === kind), nextCursor: null }));
    }
    if (url.startsWith('/api/course-progress/due')) return Promise.resolve(json({ courses: due }));
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <CoursesHomePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('CoursesHomePage', () => {
  test('says what to do when nothing is started, learned or published', async () => {
    renderWith({});
    expect(await screen.findByText(/No courses started yet/)).toBeTruthy();
    expect(await screen.findByText(/No public courses yet/)).toBeTruthy();
    expect(screen.getByText(/Courses you finish land here/)).toBeTruthy();
  });

  test('Learning, Browse and Learned, each linking into the course', async () => {
    renderWith({
      enrollments: [enrollment('englund-aaaaaaaaaaaa', 'Englund trap', null), enrollment('fork-bbbbbbbbbbbb', 'Knight forks', '2026-09-25T00:00:00.000Z')],
      catalogue: [catalogueItem('englund-aaaaaaaaaaaa', 'Englund trap'), catalogueItem('caro-cccccccccccc', 'Caro-Kann', 'opening_course'), catalogueItem('fork-bbbbbbbbbbbb', 'Knight forks', 'tactics')],
      due: [{ slug: 'fork-bbbbbbbbbbbb', title: 'Knight forks', due: 2, sans: ['Nf7', 'Nd6'] }]
    });

    const learning = await screen.findByRole('region', { name: 'Learning' });
    expect(await within(learning).findByRole('link', { name: 'Continue course: Englund trap' })).toHaveAttribute('href', '/courses/englund-aaaaaaaaaaaa');

    const learned = screen.getByRole('region', { name: 'Learned' });
    expect(await within(learned).findByText('Knight forks')).toBeTruthy();
    expect(await within(learned).findByText('2 moves to review')).toBeTruthy();
    expect(within(learned).getByRole('link', { name: 'Drill Knight forks' })).toHaveAttribute('href', '/courses/fork-bbbbbbbbbbbb?stage=drill');

    const browse = screen.getByRole('region', { name: 'Browse' });
    expect(await within(browse).findByRole('link', { name: /Caro-Kann/ })).toHaveAttribute('href', '/courses/caro-cccccccccccc');
    expect(within(within(browse).getByRole('link', { name: /Englund trap/ })).getByText('Learning')).toBeTruthy();
    expect(within(within(browse).getByRole('link', { name: /Knight forks/ })).getByText('Learned')).toBeTruthy();

    fireEvent.click(within(browse).getByRole('button', { name: 'Opening course' }));
    expect(within(browse).getByRole('button', { name: 'Opening course' })).toHaveAttribute('aria-pressed', 'true');
    expect(await within(browse).findByText('Caro-Kann')).toBeTruthy();
    expect(within(browse).queryByText('Englund trap')).toBeNull();
  });

  test('a course can be removed from Learning', async () => {
    const fetchMock = renderWith({ enrollments: [enrollment('englund-aaaaaaaaaaaa', 'Englund trap', null)] });
    const learning = await screen.findByRole('region', { name: 'Learning' });
    fireEvent.click(await within(learning).findByRole('button', { name: 'Remove Englund trap from my learning' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/course-enrollments/englund-aaaaaaaaaaaa', expect.objectContaining({ method: 'DELETE' })));
  });
});

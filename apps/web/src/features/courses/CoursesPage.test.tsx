import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CoursesPage } from './CoursesPage.js';

const course = (overrides: Record<string, unknown>) => ({
  id: 'c1',
  slug: 'englund-aaaa',
  kind: 'trap',
  status: 'draft',
  title: 'The Englund trap',
  updatedAt: '2026-09-28T10:00:00.000Z',
  promise: 'Punish greedy trades.',
  episodes: 6,
  moves: 16,
  generation: null,
  ...overrides
});

function renderWith(courses: unknown[]): void {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ courses }), { status: 200, headers: { 'content-type': 'application/json' } }))));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <CoursesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('CoursesPage (the Course studio)', () => {
  test('a card per course: kind, status, title, promise, size; Edit, and Open once published', async () => {
    renderWith([
      course({}),
      course({ id: 'c2', slug: 'italian-bbbb', kind: 'opening_course', status: 'public', title: 'The Italian Game', episodes: 4, moves: 15 }),
      course({ id: 'c3', title: 'Being written', status: 'draft', episodes: 0, generation: { status: 'running', done: 2, total: 7 } })
    ]);
    const draft = (await screen.findByRole('heading', { name: 'The Englund trap' })).closest('article')!;
    expect(within(draft as HTMLElement).getByText('Draft')).toBeTruthy();
    expect(within(draft as HTMLElement).getByText('Trap')).toBeTruthy();
    expect(within(draft as HTMLElement).getByText('Punish greedy trades.')).toBeTruthy();
    expect(within(draft as HTMLElement).getByText(/16 moves · 6 episodes · edited/)).toBeTruthy();
    expect(within(draft as HTMLElement).getByRole('link', { name: 'Edit The Englund trap' })).toHaveAttribute('href', '/studio/c1/edit');
    expect(within(draft as HTMLElement).queryByRole('link', { name: /Open/ })).toBeNull();

    const published = screen.getByRole('heading', { name: 'The Italian Game' }).closest('article')! as HTMLElement;
    expect(within(published).getByText('Public')).toBeTruthy();
    expect(within(published).getByRole('link', { name: 'Open The Italian Game' })).toHaveAttribute('href', '/learn/italian-bbbb');

    const writing = screen.getByRole('heading', { name: 'Being written' }).closest('article')! as HTMLElement;
    expect(within(writing).getByRole('progressbar', { name: 'The AI is writing: 2 of 7' })).toBeTruthy();

    expect(screen.getByRole('link', { name: 'New course' })).toHaveAttribute('href', '/studio/new');
  });

  test('filters: drafts and published', async () => {
    renderWith([course({}), course({ id: 'c2', status: 'unlisted', title: 'Unlisted one' })]);
    await screen.findByRole('heading', { name: 'The Englund trap' });
    fireEvent.click(screen.getByRole('button', { name: 'Published' }));
    expect(screen.queryByRole('heading', { name: 'The Englund trap' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Unlisted one' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Drafts' }));
    expect(screen.getByRole('heading', { name: 'The Englund trap' })).toBeTruthy();
  });

  test('with none yet, says how a course is made', async () => {
    renderWith([]);
    expect(await screen.findByText(/Paste a PGN/)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'New course' }).length).toBeGreaterThan(0);
  });
});

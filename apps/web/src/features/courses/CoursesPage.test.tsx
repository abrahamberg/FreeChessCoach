import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CoursesPage } from './CoursesPage.js';

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

describe('CoursesPage', () => {
  test('lists the creator courses, each opening its editor', async () => {
    renderWith([{ id: 'c1', slug: 'englund', kind: 'trap', status: 'draft', title: 'The Englund trap', updatedAt: '2026-09-28T10:00:00.000Z', promise: '', episodes: 0, moves: 16, generation: null }]);
    expect(await screen.findByRole('link', { name: 'The Englund trap' })).toHaveAttribute('href', '/studio/c1/edit');
    expect(screen.getByRole('link', { name: 'New course' })).toHaveAttribute('href', '/studio/new');
  });

  test('says so when there are none', async () => {
    renderWith([]);
    expect(await screen.findByText(/No courses yet/)).toBeTruthy();
  });
});

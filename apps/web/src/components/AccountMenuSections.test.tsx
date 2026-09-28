import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AccountMenuSections } from './AccountMenuSections.js';

const PROFILE = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'me@example.com',
  displayName: 'Me',
  ratingBand: 'improving',
  rating: null,
  ratingSource: null,
  engineMode: 'chess_api',
  coachPersona: 'general',
  lichessUsername: null,
  chesscomUsername: null,
  selfAssessment: null,
  ttsEnabled: false,
  ttsBackend: 'openai',
  onboarded: true
};

function renderMenu(profile: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(profile), { status: 200, headers: { 'content-type': 'application/json' } })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AccountMenuSections onClose={() => undefined} onReportBug={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AccountMenuSections', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('shows Your courses only to a course creator', async () => {
    renderMenu({ ...PROFILE, canCreateCourses: true });
    expect(await screen.findByRole('menuitem', { name: 'Your courses' })).toHaveAttribute('href', '/courses');
  });

  test('hides Your courses from everyone else', async () => {
    renderMenu({ ...PROFILE, canCreateCourses: false });
    await screen.findByText('me@example.com');
    expect(screen.queryByRole('menuitem', { name: 'Your courses' })).toBeNull();
  });
});

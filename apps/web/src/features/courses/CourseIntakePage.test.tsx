import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CourseIntakePage } from './CourseIntakePage.js';

const ENGLUND = '[Result "0-1"]\n1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2 6. Bc3 Bb4 7. Qd2 Bxc3 8. Qxc3 Qc1# 0-1';

function renderPage() {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith('/api/users/me')) return Promise.resolve(new Response('{}', { status: 404 }));
    if (init?.method === 'POST') return Promise.resolve(new Response('{}', { status: 400, headers: { 'content-type': 'application/json' } }));
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <CourseIntakePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('CourseIntakePage', () => {
  test('kinds are cards; the PGN shows its end position and size; the example fills the direction; it posts the choices', async () => {
    const fetchMock = renderPage();
    expect(screen.getByRole('radio', { name: /Trap/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Tactic theme/ }));
    expect(screen.getByRole('radio', { name: /Tactic theme/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Trap/ }));
    // Videos: the kind's default (a trap makes both) until chosen.
    expect(screen.getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'YouTube video' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'PGN' }), { target: { value: ENGLUND } });
    expect(screen.getByText('16 moves, 1 line, you teach Black')).toBeTruthy();
    expect(screen.getByTestId('course-intake-board')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Use this example' }));
    expect((screen.getByRole('textbox', { name: 'What to teach' }) as HTMLTextAreaElement).value).toMatch(/Englund Gambit trap/);

    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    fireEvent.click(screen.getByRole('button', { name: '1600' }));
    expect(screen.getByText(/Written for: Club level/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/courses', expect.objectContaining({ method: 'POST' })));
    const post = fetchMock.mock.calls.find(([url, init]) => url === '/api/courses' && init?.method === 'POST')!;
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({ kind: 'trap', learnerSide: 'white', rating: 1600, levelBand: 'club', videos: { video: true, reel: false } });
  });

  test('a PGN that does not parse says why and cannot be created', () => {
    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: 'PGN' }), { target: { value: '1. e4 e5 2. Ke3 *' } });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled();
  });
});

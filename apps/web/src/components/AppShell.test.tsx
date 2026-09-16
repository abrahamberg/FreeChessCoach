import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AppShell } from './AppShell.js';

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

function renderShell(initialPath = '/games') {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in test')));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppShell>
          <div>content</div>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AppShell (design-improvements.md: top bar + account menu)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('shows the primary nav inline in the top bar at/above the desktop breakpoint, no bottom tab bar', () => {
    mockMatchMedia(true);
    renderShell();

    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /tab bar/i })).not.toBeInTheDocument();
  });

  test('shows a bottom tab bar below the desktop breakpoint, with the primary nav out of the top bar', () => {
    mockMatchMedia(false);
    renderShell();

    expect(screen.getByRole('navigation', { name: /tab bar/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /primary/i })).not.toBeInTheDocument();
  });

  test('the account menu (Settings, Sign out) is reachable from the top bar at every width', () => {
    mockMatchMedia(false);
    renderShell();

    expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
  });

  test('during an active session, hides the entire top bar and the bottom tab bar — the page owns its own back button', () => {
    mockMatchMedia(false);
    renderShell('/session/abc');

    expect(screen.queryByRole('navigation', { name: /tab bar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /account menu/i })).not.toBeInTheDocument();
  });

  test('the top bar stays hidden during an active session at the desktop breakpoint too', () => {
    mockMatchMedia(true);
    renderShell('/session/abc');

    expect(screen.queryByRole('navigation', { name: /primary/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /account menu/i })).not.toBeInTheDocument();
  });

  test('also hides the top bar for a bot-session, practice, or review route — all put a board on screen too', () => {
    mockMatchMedia(true);
    renderShell('/bot-session/abc');
    expect(screen.queryByRole('navigation', { name: /primary/i })).not.toBeInTheDocument();

    renderShell('/practice/abc');
    expect(screen.queryByRole('navigation', { name: /primary/i })).not.toBeInTheDocument();

    renderShell('/review/abc');
    expect(screen.queryByRole('navigation', { name: /primary/i })).not.toBeInTheDocument();
  });

  test('always renders the page content', () => {
    mockMatchMedia(true);
    renderShell();

    expect(screen.getByText('content')).toBeInTheDocument();
  });
});

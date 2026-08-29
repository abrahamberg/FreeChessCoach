import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { UserMenu } from './UserMenu.js';

function renderMenu(props: Parameters<typeof UserMenu>[0] = {}) {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in test')));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UserMenu {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('UserMenu', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('without engineActivity (desktop — the topbar already shows its own pill), no engine row appears', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));

    expect(screen.queryByText('Internal')).not.toBeInTheDocument();
  });

  test('with engineActivity (mobile — no room for a separate topbar pill), the menu carries the same status as a row linking directly to the engine settings section', async () => {
    renderMenu({ engineActivity: { kind: 'idle', engineMode: 'native' } });
    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));

    const row = screen.getByText('Internal').closest('a');
    expect(row).toHaveAttribute('href', '/settings#settings-engine');
  });
});

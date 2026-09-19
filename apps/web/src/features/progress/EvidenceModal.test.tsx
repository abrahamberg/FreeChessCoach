import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { EvidenceModal } from './EvidenceModal.js';

function renderModal(body: unknown, status = 200) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <EvidenceModal code="TA-07" label="Knight-fork recognition" onClose={vi.fn()} />
    </QueryClientProvider>
  );
  return fetchMock;
}

describe('EvidenceModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('fetches the code\'s evidence and renders each item\'s move reference, severity, and date', async () => {
    const fetchMock = renderModal({
      code: 'TA-07',
      label: 'Knight-fork recognition',
      items: [
        { gameId: 'g1', ply: 23, direction: 'D', failed: true, hwdl: 0.6, severity: 'major', reachability: 0.7, createdAt: '2026-07-20T10:00:00.000Z' }
      ]
    });

    expect(await screen.findByText("White's move 12")).toBeInTheDocument();
    expect(screen.getByText(/major/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/users/me/diagnostics/TA-07/evidence', expect.anything());
    expect(screen.getByRole('heading', { name: /evidence — knight-fork recognition/i })).toBeInTheDocument();
  });

  test('an empty items list renders a fallback message, not an empty list', async () => {
    renderModal({ code: 'TA-07', label: 'Knight-fork recognition', items: [] });

    expect(await screen.findByText(/no recorded evidence yet/i)).toBeInTheDocument();
  });

  test('a fetch failure renders an error message', async () => {
    renderModal({ error: 'nope' }, 500);

    expect(await screen.findByText(/could not load evidence/i)).toBeInTheDocument();
  });
});

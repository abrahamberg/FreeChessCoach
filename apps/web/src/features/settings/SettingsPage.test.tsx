import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SettingsPage } from './SettingsPage.js';

const PROFILE = {
  id: '7d9f2a44-9a5f-4f6e-b1a1-0a4c1e2d3f4b', email: 'daniel@example.com', displayName: 'daniel',
  ratingBand: 'club', lichessUsername: null, chesscomUsername: null, selfAssessment: null,
  engineMode: 'native', coachPersona: 'general', ttsEnabled: false, ttsBackend: 'openai'
};
const EMPTY_SETUP = { configured: false, unlocked: false, voiceAvailable: false };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderSettings(fetchMock: ReturnType<typeof vi.fn>, initialEntries: string[] = ['/settings']): void {
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={initialEntries}><SettingsPage /></MemoryRouter></QueryClientProvider>);
}

function defaultFetch(path: string, init?: RequestInit): Response | undefined {
  if (path === '/api/users/me' && (!init || init.method === undefined)) return jsonResponse(PROFILE);
  if (path === '/api/users/me/llm-setup') return jsonResponse(EMPTY_SETUP);
  return undefined;
}

describe('SettingsPage', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  test('renders the passphrase-protected AI setup defaults', async () => {
    const fetchMock = vi.fn((path: string, init?: RequestInit) => defaultFetch(path, init) ?? (() => { throw new Error(`unexpected fetch: ${path}`); })());
    renderSettings(fetchMock);
    await screen.findByRole('heading', { name: 'Settings', level: 1 });
    expect(screen.getByLabelText('API URL')).toHaveValue('https://api.openai.com/v1');
    expect(screen.getByLabelText('Low model')).toHaveValue('luna');
    expect(screen.getByLabelText('High model')).toHaveValue('terra');
    expect(screen.getByLabelText('Voice model (optional)')).toHaveValue('gpt-4o-mini-tts');
  });

  test('saves the endpoint, models, key and unlock phrase as one setup', async () => {
    const fetchMock = vi.fn((path: string, init?: RequestInit) => {
      if (path === '/api/users/me/llm-setup' && init?.method === 'PUT') return new Response(null, { status: 204 });
      return defaultFetch(path, init) ?? (() => { throw new Error(`unexpected fetch: ${path}`); })();
    });
    renderSettings(fetchMock);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Settings', level: 1 });
    await user.type(screen.getByLabelText('API key'), 'secret');
    await user.type(screen.getByLabelText('Unlock phrase (8+ characters)'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Test and save' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/users/me/llm-setup', expect.objectContaining({ method: 'PUT' })));
    const request = fetchMock.mock.calls.find(([path, init]) => path === '/api/users/me/llm-setup' && init?.method === 'PUT')?.[1];
    expect(JSON.parse(request?.body as string)).toMatchObject({ apiKey: 'secret', lowModel: 'luna', highModel: 'terra', unlockPhrase: 'correct horse battery staple' });
  });

  test('unlocks and locks the configured setup', async () => {
    let unlocked = false;
    const fetchMock = vi.fn((path: string, init?: RequestInit) => {
      if (path === '/api/users/me/llm-setup' && (!init || init.method === undefined) && !unlocked) return jsonResponse({ configured: true, unlocked: false, protocol: 'openai-chat', lowModel: 'luna', highModel: 'terra', voiceAvailable: false });
      if (path === '/api/users/me/llm-setup' && (!init || init.method === undefined)) return jsonResponse(unlocked ? { configured: true, unlocked: true, protocol: 'openai-chat', lowModel: 'luna', highModel: 'terra', voiceAvailable: false } : { configured: true, unlocked: false, voiceAvailable: false });
      if (path.endsWith('/unlock')) { unlocked = true; return jsonResponse({ configured: true, unlocked: true, protocol: 'openai-chat', lowModel: 'luna', highModel: 'terra', voiceAvailable: false }); }
      if (path.endsWith('/lock')) { unlocked = false; return new Response(null, { status: 204 }); }
      return defaultFetch(path, init) ?? (() => { throw new Error(`unexpected fetch: ${path}`); })();
    });
    renderSettings(fetchMock);
    const user = userEvent.setup();
    await screen.findByText('AI setup is locked');
    await user.type(screen.getByLabelText('Unlock phrase'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('button', { name: 'Lock now' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lock now' }));
    expect(await screen.findByRole('button', { name: 'Unlock' })).toBeInTheDocument();
  });

  test('editing the nickname still PATCHes the profile', async () => {
    const fetchMock = vi.fn((path: string, init?: RequestInit) => {
      if (path === '/api/users/me' && init?.method === 'PATCH') return jsonResponse({ ...PROFILE, displayName: 'Dani' });
      return defaultFetch(path, init) ?? (() => { throw new Error(`unexpected fetch: ${path}`); })();
    });
    renderSettings(fetchMock);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Settings', level: 1 });
    await user.click(screen.getByRole('button', { name: /edit/i }));
    const input = screen.getByRole('textbox', { name: /nickname/i });
    await user.clear(input); await user.type(input, 'Dani');
    await user.click(within(input.closest('form') as HTMLElement).getByRole('button', { name: /save/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/users/me', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ displayName: 'Dani' }) })));
  });
});

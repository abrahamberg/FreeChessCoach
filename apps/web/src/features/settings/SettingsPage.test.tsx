import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SettingsPage } from './SettingsPage.js';

const PROFILE = {
  id: '7d9f2a44-9a5f-4f6e-b1a1-0a4c1e2d3f4b',
  email: 'daniel@example.com',
  displayName: 'daniel',
  ratingBand: 'club',
  rating: null,
  ratingSource: null,
  lichessUsername: null,
  chesscomUsername: null,
  selfAssessment: null,
  engineMode: 'native',
  coachPersona: 'general',
  ttsEnabled: false,
  ttsBackend: 'openai'
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

  test('renders the passphrase-protected AI setup prefilled with the current default models', async () => {
    const fetchMock = vi.fn((path: string, init?: RequestInit) => defaultFetch(path, init) ?? (() => { throw new Error(`unexpected fetch: ${path}`); })());
    renderSettings(fetchMock);
    await screen.findByRole('heading', { name: 'Settings', level: 1 });
    expect(screen.getByLabelText('API URL')).toHaveValue('https://api.openai.com/v1');
    expect(screen.getByLabelText('Low model')).toHaveValue('gpt-5.6-luna');
    expect(screen.getByLabelText('High model')).toHaveValue('gpt-5.6-terra');
    expect(screen.getByLabelText('Voice model (optional)')).toHaveValue('gpt-4o-mini-tts');
  });

  test('points the AI setup at the step-by-step guide, the free option and the key-safety page, in a new tab', async () => {
    const fetchMock = vi.fn((path: string, init?: RequestInit) => defaultFetch(path, init) ?? (() => { throw new Error(`unexpected fetch: ${path}`); })());
    renderSettings(fetchMock);
    await screen.findByRole('heading', { name: 'Settings', level: 1 });
    const setup = screen.getByRole('region', { name: 'API keys' });
    const guide = within(setup).getByRole('link', { name: /step-by-step/i });
    expect(guide).toHaveAttribute('href', '/openai-key');
    expect(guide).toHaveAttribute('target', '_blank');
    expect(within(setup).getByRole('link', { name: /free usage/i })).toHaveAttribute('href', '/openai-key#free');
    expect(within(setup).getByRole('link', { name: /keeps? your key safe|how we handle/i })).toHaveAttribute('href', '/keys');
  });

  test('saves the endpoint, models, key and unlock phrase as one setup, gated by a passing test, across the connect-then-unlock-phrase wizard', async () => {
    const testResponse = {
      protocol: 'openai-chat',
      low: { model: 'gpt-5.6-luna', ok: true },
      high: { model: 'gpt-5.6-terra', ok: true },
      voice: null
    };
    const fetchMock = vi.fn((path: string, init?: RequestInit) => {
      if (path === '/api/users/me/llm-setup/test' && init?.method === 'POST') return jsonResponse(testResponse);
      if (path === '/api/users/me/llm-setup' && init?.method === 'PUT') return new Response(null, { status: 204 });
      return defaultFetch(path, init) ?? (() => { throw new Error(`unexpected fetch: ${path}`); })();
    });
    renderSettings(fetchMock);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Settings', level: 1 });
    // Connect step: no phrase field on screen yet.
    expect(screen.queryByLabelText('Unlock phrase (8+ characters)')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('API key'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Test connection' }));

    // A passing test replaces the form with the connection result — the
    // intermediate "form replaced by a loader" behavior is covered
    // deterministically (via a controlled isTesting prop) in LlmSetupForm.test.tsx.
    await screen.findByText('Detected format');
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Proceed' }));
    const phraseInput = screen.getByLabelText('Unlock phrase (8+ characters)');
    await user.type(phraseInput, 'correct horse battery staple');
    await user.click(within(phraseInput.closest('form') as HTMLElement).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/users/me/llm-setup', expect.objectContaining({ method: 'PUT' })));
    const request = fetchMock.mock.calls.find(([path, init]) => path === '/api/users/me/llm-setup' && init?.method === 'PUT')?.[1];
    expect(JSON.parse(request?.body as string)).toMatchObject({
      apiKey: 'secret',
      lowModel: 'gpt-5.6-luna',
      highModel: 'gpt-5.6-terra',
      unlockPhrase: 'correct horse battery staple'
    });
  });

  test('unlocks via the popup, with feedback, and locks the configured setup', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Enter unlock phrase' }));
    await screen.findByRole('dialog', { name: 'Unlock your AI setup' });
    await user.type(screen.getByLabelText('Unlock phrase'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await screen.findByText('AI setup unlocked.');
    expect(await screen.findByRole('button', { name: 'Lock now' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lock now' }));
    expect(await screen.findByRole('button', { name: 'Enter unlock phrase' })).toBeInTheDocument();
  });

  test('shows the specific reason a wrong unlock phrase was rejected', async () => {
    const fetchMock = vi.fn((path: string, init?: RequestInit) => {
      if (path === '/api/users/me/llm-setup' && (!init || init.method === undefined)) {
        return jsonResponse({ configured: true, unlocked: false, voiceAvailable: false });
      }
      if (path.endsWith('/unlock')) {
        return jsonResponse({ type: 'about:blank', title: 'That unlock phrase is incorrect.', status: 400 }, 400);
      }
      return defaultFetch(path, init) ?? (() => { throw new Error(`unexpected fetch: ${path}`); })();
    });
    renderSettings(fetchMock);
    const user = userEvent.setup();
    await screen.findByText('AI setup is locked');
    await user.click(screen.getByRole('button', { name: 'Enter unlock phrase' }));
    await user.type(screen.getByLabelText('Unlock phrase'), 'wrong phrase entirely');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText('That unlock phrase is incorrect.')).toBeInTheDocument();
  });

  test('deleting the account requires confirmation, then DELETEs and signs out', async () => {
    const fetchMock = vi.fn((path: string, init?: RequestInit) => {
      if (path === '/api/users/me' && init?.method === 'DELETE') return new Response(null, { status: 204 });
      return defaultFetch(path, init) ?? (() => { throw new Error(`unexpected fetch: ${path}`); })();
    });
    renderSettings(fetchMock);
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', { value: { ...originalLocation, href: '' }, writable: true });
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Settings', level: 1 });

    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/users/me', expect.objectContaining({ method: 'DELETE' }));

    await user.click(within(dialog).getByRole('button', { name: 'Delete account' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/users/me', expect.objectContaining({ method: 'DELETE' })));
    await waitFor(() => expect(window.location.href).toBe('/oauth2/sign_out?rd=/'));
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
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

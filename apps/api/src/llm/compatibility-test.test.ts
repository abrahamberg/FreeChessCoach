import { afterEach, describe, expect, test, vi } from 'vitest';
import { requiresOpenAiResponsesApi, testLlmSetup } from './compatibility-test.js';

const OK_BODIES: Record<string, object> = {
  '/responses': { output: [] },
  '/messages': { content: [{ type: 'text', text: 'OK' }] },
  '/chat/completions': { choices: [{ message: { content: 'OK' } }] }
};

/** Answers each path for the models in `accepts[path]`, 404 otherwise, and
 * records every (path, model) probe. */
function mockEndpoint(accepts: Record<string, string[]>): Array<{ path: string; model: string }> {
  const calls: Array<{ path: string; model: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, init: RequestInit) => {
      const path = url.pathname.replace('/api/v1', '');
      const { model } = JSON.parse(String(init.body)) as { model: string };
      calls.push({ path, model });
      const ok = accepts[path]?.includes(model) ?? false;
      return ok
        ? new Response(JSON.stringify(OK_BODIES[path]), { status: 200 })
        : new Response(JSON.stringify({ error: { message: 'not supported' } }), { status: 404 });
    })
  );
  return calls;
}

const SETUP = { endpoint: 'https://openrouter.ai/api/v1', apiKey: 'k', lowModel: 'openai/gpt-5.6-luna', highModel: 'anthropic/claude-sonnet-5' };

describe('testLlmSetup (remote)', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('detects each model’s own format', async () => {
    mockEndpoint({ '/responses': ['openai/gpt-5.6-luna'], '/messages': ['anthropic/claude-sonnet-5'] });
    const result = await testLlmSetup(SETUP);
    expect(result.low).toMatchObject({ ok: true, protocol: 'openai-responses' });
    expect(result.high).toMatchObject({ ok: true, protocol: 'anthropic' });
    expect(result.protocol).toBe('anthropic');
  });

  test('tries Responses, then Anthropic, then Chat, and stops at the first pass', async () => {
    const calls = mockEndpoint({ '/chat/completions': ['llama'] });
    await testLlmSetup({ ...SETUP, lowModel: 'llama', highModel: 'llama' });
    expect(calls.map((call) => call.path)).toEqual(['/responses', '/messages', '/chat/completions']);
  });

  test('probes a model shared by both tiers once', async () => {
    const calls = mockEndpoint({ '/responses': ['m'] });
    const result = await testLlmSetup({ ...SETUP, lowModel: 'm', highModel: 'm' });
    expect(calls).toHaveLength(1);
    expect(result.protocol).toBe('openai-responses');
  });

  test('never falls back to chat completions for gpt-5.4+', async () => {
    const calls = mockEndpoint({ '/chat/completions': ['gpt-5.6-terra'] });
    const result = await testLlmSetup({ ...SETUP, lowModel: 'gpt-5.6-terra', highModel: 'gpt-5.6-terra' });
    expect(calls.map((call) => call.path)).not.toContain('/chat/completions');
    expect(result.protocol).toBeNull();
  });

  test('every probe carries a tool', async () => {
    mockEndpoint({ '/responses': ['m'] });
    await testLlmSetup({ ...SETUP, lowModel: 'm', highModel: 'm' });
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)) as { tools?: unknown[] };
    expect(body.tools).toHaveLength(1);
  });
});

describe('requiresOpenAiResponsesApi', () => {
  test('recognises OpenRouter-prefixed ids', () => {
    expect(requiresOpenAiResponsesApi('openai/gpt-5.6-luna')).toBe(true);
    expect(requiresOpenAiResponsesApi('gpt-5.2')).toBe(false);
    expect(requiresOpenAiResponsesApi('anthropic/claude-sonnet-5')).toBe(false);
  });
});

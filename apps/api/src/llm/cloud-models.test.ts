import { afterEach, describe, expect, test, vi } from 'vitest';
import { fetchCloudModels, modelIds } from './cloud-models.js';

vi.mock('./endpoint-fetch.js', () => ({ endpointFetch: () => globalThis.fetch }));

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(responses: Record<string, Response>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) => Promise.resolve(responses[url.split('?')[0] ?? ''] ?? new Response(null, { status: 404 })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const list = (...ids: string[]): Response => Response.json({ data: ids.map((id) => ({ id })) });

describe('fetchCloudModels', () => {
  test('splits OpenAI models into text and voice, dropping non-chat ones', async () => {
    stubFetch({ 'https://api.openai.com/v1/models': list('gpt-6-sol', 'text-embedding-3-small', 'gpt-4o-mini-tts', 'gpt-6-luna', 'whisper-1') });
    expect(await fetchCloudModels('openai', 'sk')).toEqual({ models: ['gpt-6-luna', 'gpt-6-sol'], voiceModels: ['gpt-4o-mini-tts'] });
  });

  test('sends the Anthropic key in x-api-key with a version header', async () => {
    const fetchMock = stubFetch({ 'https://api.anthropic.com/v1/models': list('claude-sonnet-5') });
    expect((await fetchCloudModels('anthropic', 'sk-ant')).models).toEqual(['claude-sonnet-5']);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'x-api-key': 'sk-ant', 'anthropic-version': '2023-06-01' });
  });

  test('checks an OpenRouter key before trusting its public model list', async () => {
    stubFetch({
      'https://openrouter.ai/api/v1/key': new Response(null, { status: 401 }),
      'https://openrouter.ai/api/v1/models': list('openai/gpt-6-sol')
    });
    expect(await fetchCloudModels('openrouter', 'bad')).toEqual({ models: [], voiceModels: [], error: 'That API key was rejected.' });
  });

  test('lists OpenRouter models once the key passes', async () => {
    stubFetch({
      'https://openrouter.ai/api/v1/key': Response.json({ data: {} }),
      'https://openrouter.ai/api/v1/models': list('openai/gpt-6-sol', 'anthropic/claude-sonnet-5')
    });
    expect((await fetchCloudModels('openrouter', 'ok')).models).toEqual(['openai/gpt-6-sol', 'anthropic/claude-sonnet-5']);
  });
});

describe('model order', () => {
  test('GPT models first, newest version first, then the rest alphabetically', () => {
    const ids = ['o3', 'gpt-4o', 'gpt-5', 'chatgpt-4o-latest', 'gpt-6-sol', 'gpt-5.4-mini', 'gpt-4.1', 'gpt-6-luna', 'gpt-5.4', 'babbage-2'];
    expect(modelIds({ data: ids.map((id) => ({ id })) })).toEqual([
      'gpt-6-luna', 'gpt-6-sol', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5', 'gpt-4.1', 'gpt-4o', 'babbage-2', 'chatgpt-4o-latest', 'o3'
    ]);
  });

  test("ignores OpenRouter's openai/ prefix", () => {
    expect(modelIds({ data: [{ id: 'anthropic/claude-sonnet-5' }, { id: 'openai/gpt-5' }, { id: 'openai/gpt-6-sol' }] })).toEqual([
      'openai/gpt-6-sol', 'openai/gpt-5', 'anthropic/claude-sonnet-5'
    ]);
  });
});

describe('modelIds', () => {
  test('ignores anything that is not a list of ids', () => {
    expect(modelIds({ data: [{ id: 'b' }, { id: 'a' }, { id: 'a' }, { name: 'x' }, null] })).toEqual(['a', 'b']);
    expect(modelIds('nope')).toEqual([]);
  });
});

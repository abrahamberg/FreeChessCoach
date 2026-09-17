import { afterEach, describe, expect, test, vi } from 'vitest';
import { requiresOpenAiResponsesApi, testLlmSetup } from './compatibility-test.js';

const setup = {
  endpoint: 'https://provider.example/v1',
  apiKey: 'secret',
  lowModel: 'luna',
  highModel: 'terra',
  voiceModel: 'voice-model'
};

describe('testLlmSetup', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('selects Anthropic when OpenAI formats fail and reports the failing model', async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url.endsWith('/messages')) {
        return Promise.resolve(new Response(JSON.stringify({ content: [{ type: 'text', text: 'OK' }] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ error: { message: 'unsupported format' } }), { status: 400 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testLlmSetup({ ...setup, voiceModel: undefined });

    expect(result.protocol).toBe('anthropic');
    expect(result.low.ok).toBe(true);
    expect(result.high.ok).toBe(true);
    expect(result.voice).toBeNull();
  });

  test('rejects a voice model that does not return audio', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url.endsWith('/audio/speech')) return Promise.resolve(new Response('not audio', { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 }));
    }));

    const result = await testLlmSetup(setup);
    expect(result.protocol).toBe('openai-chat');
    expect(result.voice).toMatchObject({ model: 'voice-model', ok: false, error: 'The endpoint did not return audio data' });
  });

  test('extracts the provider message instead of dumping the raw JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { message: 'The model `luna` does not exist', type: 'invalid_request_error', code: 'model_not_found' } }), {
            status: 404
          })
        )
      )
    );

    const result = await testLlmSetup({ ...setup, voiceModel: undefined });

    expect(result.low.error).toContain('The model `luna` does not exist');
    expect(result.low.error).not.toContain('invalid_request_error');
  });

  test('reports every attempted format when neither text model is compatible', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.resolve(new Response('bad key', { status: 401 }))));

    const result = await testLlmSetup({ ...setup, voiceModel: undefined });

    expect(result.protocol).toBeNull();
    expect(result.low).toMatchObject({ model: 'luna', ok: false });
    expect(result.low.error).toContain('openai-chat:');
    expect(result.low.error).toContain('anthropic:');
    expect(result.high).toMatchObject({ model: 'terra', ok: false });
  });

  test('never probes chat completions for a gpt-5.4+ model, even if chat would have "passed"', async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>((input) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.endsWith('/responses')) return Promise.resolve(new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }] }), { status: 200 }));
        // Would also satisfy hasTextResponse for chat completions — proves the
        // deterministic gate, not a probe race, is what keeps chat unused.
        return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 }));
      })
    );

    const result = await testLlmSetup({ ...setup, lowModel: 'gpt-5.4-mini', highModel: 'gpt-5.6-terra', voiceModel: undefined });

    expect(result.protocol).toBe('openai-responses');
    expect(requestedUrls.some((url) => url.endsWith('/chat/completions'))).toBe(false);
  });

  test('still tries chat completions first for a model below the gpt-5.4 threshold', async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>((input) => {
        const url = String(input);
        requestedUrls.push(url);
        return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 }));
      })
    );

    const result = await testLlmSetup({ ...setup, lowModel: 'gpt-5.3-mini', highModel: 'gpt-5.3', voiceModel: undefined });

    expect(result.protocol).toBe('openai-chat');
    expect(requestedUrls.every((url) => url.endsWith('/chat/completions'))).toBe(true);
  });
});

describe('requiresOpenAiResponsesApi', () => {
  test.each([
    ['gpt-5.4', true],
    ['gpt-5.4-mini', true],
    ['gpt-5.6-terra', true],
    ['gpt-6', true],
    ['gpt-6.0-nova', true],
    ['gpt-5.3', false],
    ['gpt-5', false],
    ['gpt-4o-mini', false],
    ['luna', false],
    ['openai/gpt-4o', false]
  ])('%s -> %s', (model, expected) => {
    expect(requiresOpenAiResponsesApi(model)).toBe(expected);
  });
});

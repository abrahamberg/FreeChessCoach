import { afterEach, describe, expect, test, vi } from 'vitest';
import { testLlmSetup } from './compatibility-test.js';

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

  test('reports every attempted format when neither text model is compatible', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.resolve(new Response('bad key', { status: 401 }))));

    const result = await testLlmSetup({ ...setup, voiceModel: undefined });

    expect(result.protocol).toBeNull();
    expect(result.low).toMatchObject({ model: 'luna', ok: false });
    expect(result.low.error).toContain('openai-chat:');
    expect(result.low.error).toContain('anthropic:');
    expect(result.high).toMatchObject({ model: 'terra', ok: false });
  });
});

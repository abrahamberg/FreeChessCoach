import { afterEach, describe, expect, test, vi } from 'vitest';
import { synthesizeSpeech } from './openai-tts.js';

describe('synthesizeSpeech', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('posts to the OpenAI speech endpoint and returns the raw bytes', async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(bytes, { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await synthesizeSpeech({ apiKey: 'sk-test', endpoint: 'https://api.openai.com/v1', modelId: 'tts-1', voice: 'alloy', text: 'hi' });

    expect(result).toEqual(Buffer.from(bytes));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.openai.com/v1/audio/speech');
    expect(init?.headers).toMatchObject({ authorization: 'Bearer sk-test' });
    expect(JSON.parse(init?.body as string)).toEqual({
      model: 'tts-1',
      voice: 'alloy',
      input: 'hi',
      response_format: 'mp3'
    });
  });

  test('throws with the response status and body on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.resolve(new Response('bad voice', { status: 400 })))
    );

    await expect(
      synthesizeSpeech({ apiKey: 'sk-test', endpoint: 'https://api.openai.com/v1', modelId: 'tts-1', voice: 'nope', text: 'hi' })
    ).rejects.toThrow(/400/);
  });
});

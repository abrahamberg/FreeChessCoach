import { afterEach, describe, expect, test, vi } from 'vitest';
import { openaiTtsClient } from './openai-tts-client.js';

function fakeResponse(bytes: number[], ok = true, status = 200): Response {
  return new Response(new Uint8Array(bytes), { status: ok ? status : 500 });
}

describe('openaiTtsClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('splits a multi-sentence message and requests each sentence separately, in order', async () => {
    const fetchMock = vi.fn<typeof fetch>((_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as { text: string };
      return Promise.resolve(fakeResponse([body.text.length]));
    });
    vi.stubGlobal('fetch', fetchMock);

    const chunks: Array<{ index: number; length: number }> = [];
    await openaiTtsClient.speak({ text: 'First sentence. Second sentence.', persona: 'general' }, (index, audio) =>
      chunks.push({ index, length: new Uint8Array(audio).length })
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse((init as RequestInit).body as string) as { text: string; persona: string }
    );
    expect(bodies).toEqual([
      { text: 'First sentence.', persona: 'general' },
      { text: 'Second sentence.', persona: 'general' }
    ]);
    // Delivered strictly in order, chunk 0 before chunk 1.
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
  });

  test('a single-sentence message is one request, one chunk', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(fakeResponse([1, 2, 3])));
    vi.stubGlobal('fetch', fetchMock);

    const chunks: number[] = [];
    await openaiTtsClient.speak({ text: 'Just one sentence', persona: 'general' }, (index) => chunks.push(index));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual([0]);
  });

  test('delivers each sentence chunk before requesting the next (first audio arrives before the last request even fires)', async () => {
    const order: string[] = [];
    const fetchMock = vi.fn<typeof fetch>((_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as { text: string };
      order.push(`request:${body.text}`);
      return Promise.resolve(fakeResponse([0]));
    });
    vi.stubGlobal('fetch', fetchMock);

    await openaiTtsClient.speak({ text: 'One. Two. Three.', persona: 'general' }, (index) =>
      order.push(`chunk:${index}`)
    );

    expect(order).toEqual(['request:One.', 'chunk:0', 'request:Two.', 'chunk:1', 'request:Three.', 'chunk:2']);
  });

  test('a later sentence failing stops there — earlier chunks were already delivered', async () => {
    const fetchMock = vi.fn<typeof fetch>((_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as { text: string };
      return Promise.resolve(fakeResponse([0], body.text !== 'Second.'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const chunks: number[] = [];
    await expect(
      openaiTtsClient.speak({ text: 'First. Second. Third.', persona: 'general' }, (index) => chunks.push(index))
    ).rejects.toThrow(/500/);

    expect(chunks).toEqual([0]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // never requested "Third."
  });
});

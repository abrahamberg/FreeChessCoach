import { afterEach, describe, expect, test, vi } from 'vitest';
import { localTtsClient } from './local-tts-client.js';

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function stubFetch(status = 200) {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('localTtsClient', () => {
  test('requests one sentence at a time, in order, with the persona voice', async () => {
    const fetchMock = stubFetch();
    const chunks: number[] = [];
    await localTtsClient.speak({ text: 'Nice move. Watch the knight.', persona: 'general' }, (index) => chunks.push(index));

    expect(chunks).toEqual([0, 1]);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0]?.[0]).toBe('http://localhost:8880/v1/audio/speech');
    const bodies = calls.map(([, init]) => JSON.parse(String(init.body)) as { input: string; voice: string });
    expect(bodies.map((body) => body.input)).toEqual(['Nice move.', 'Watch the knight.']);
    expect(bodies[0]?.voice).toBe('bm_daniel');
  });

  test('uses the saved port', async () => {
    window.localStorage.setItem('fcc.localTtsPort', '9000');
    const fetchMock = stubFetch();
    await localTtsClient.speak({ text: 'Hello there', persona: 'general' }, () => {});
    expect((fetchMock.mock.calls as unknown as [string][])[0]?.[0]).toBe('http://localhost:9000/v1/audio/speech');
  });

  test('rejects when the server errors', async () => {
    stubFetch(500);
    await expect(localTtsClient.speak({ text: 'Hi there', persona: 'general' }, () => {})).rejects.toThrow('500');
  });
});

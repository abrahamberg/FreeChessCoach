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

function callsOf(fetchMock: ReturnType<typeof stubFetch>): [string, RequestInit][] {
  return fetchMock.mock.calls as unknown as [string, RequestInit][];
}

describe('localTtsClient', () => {
  test('requests one sentence at a time, in order, with the persona voice', async () => {
    const fetchMock = stubFetch();
    const chunks: number[] = [];
    await localTtsClient.speak({ text: 'Nice move. Watch the knight.', persona: 'general' }, (index) => chunks.push(index));

    expect(chunks).toEqual([0, 1]);
    const calls = callsOf(fetchMock);
    expect(calls[0]?.[0]).toBe('http://localhost:8880/v1/audio/speech');
    const bodies = calls.map(([, init]) => JSON.parse(String(init.body)) as { input: string; voice: string });
    expect(bodies.map((body) => body.input)).toEqual(['Nice move.', 'Watch the knight.']);
    expect(bodies[0]?.voice).toBe('bm_daniel');
  });

  test('uses the saved address and sends no Authorization header', async () => {
    window.localStorage.setItem('fcc.localTtsUrl', 'http://192.168.1.5:9000');
    const fetchMock = stubFetch();
    await localTtsClient.speak({ text: 'Hello there', persona: 'general' }, () => {});
    const [url, init] = callsOf(fetchMock)[0] ?? ['', {}];
    expect(url).toBe('http://192.168.1.5:9000/v1/audio/speech');
    expect(Object.keys(init.headers as Record<string, string>)).toEqual(['content-type']);
  });

  test('rejects with the HTTP status when the server errors', async () => {
    stubFetch(500);
    await expect(localTtsClient.speak({ text: 'Hi there', persona: 'general' }, () => {})).rejects.toMatchObject({ status: 500 });
  });
});

import { afterEach, describe, expect, test, vi } from 'vitest';
import { synthesizeSpeech } from './openai-tts.js';

vi.mock('./endpoint-fetch.js', () => ({ endpointFetch: () => globalThis.fetch }));

afterEach(() => {
  vi.unstubAllGlobals();
});

async function sentBody(modelId: string, speed?: number): Promise<Record<string, unknown>> {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(new Uint8Array([1]))));
  vi.stubGlobal('fetch', fetchMock);
  await synthesizeSpeech({
    apiKey: 'sk-test',
    endpoint: 'https://api.openai.com/v1',
    modelId,
    voice: 'ballad',
    instructions: 'An elderly professor.',
    speed,
    text: 'Why does this move work?'
  });
  const [, init] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0] ?? ['', {}];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe('synthesizeSpeech', () => {
  test('sends delivery instructions to gpt-4o-mini-tts', async () => {
    expect(await sentBody('gpt-4o-mini-tts')).toMatchObject({ voice: 'ballad', instructions: 'An elderly professor.' });
  });

  test('sends speed only when it differs from normal', async () => {
    expect(await sentBody('gpt-4o-mini-tts', 1.2)).toMatchObject({ speed: 1.2 });
    expect(await sentBody('gpt-4o-mini-tts', 1)).not.toHaveProperty('speed');
  });

  test('drops instructions for the tts-1 models, which reject them', async () => {
    expect(await sentBody('tts-1-hd')).not.toHaveProperty('instructions');
  });
});

import { randomBytes } from 'node:crypto';
import type { Kysely } from 'kysely';
import { afterEach, beforeAll, afterAll, describe, expect, test, vi } from 'vitest';
import { buildApp } from '../app.js';
import type { Database } from '../db/schema.js';
import { createKeyVault } from '../llm/key-vault.js';
import type { TtsConfig } from '../services/tts.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';

const ttsConfig: TtsConfig = { modelId: 'tts-1' };
const keyVault = createKeyVault(randomBytes(32).toString('base64'));

function fakeMp3Response(bytes: Uint8Array): Response {
  return new Response(bytes, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
}

describe('POST /api/tts/speak', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function headersForNewUser(email: string): Promise<Record<string, string>> {
    const headers = { 'x-auth-request-email': email, 'x-auth-request-user': 'Tester' };
    const app = buildApp({ authMode: 'proxy', db, keyVault, ttsConfig });
    await app.inject({ method: 'GET', url: '/api/users/me', headers });
    return headers;
  }

  test('rejects when the account has not enabled coach voice', async () => {
    const app = buildApp({ authMode: 'proxy', db, keyVault, ttsConfig });
    const headers = await headersForNewUser('tts-disabled@example.com');

    const response = await app.inject({
      method: 'POST',
      url: '/api/tts/speak',
      headers,
      payload: { text: 'hello there', persona: 'general' }
    });

    expect(response.statusCode).toBe(403);
  });

  test('rejects when the account is enabled but on the browser backend', async () => {
    const app = buildApp({ authMode: 'proxy', db, keyVault, ttsConfig });
    const headers = await headersForNewUser('tts-browser@example.com');
    await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers,
      payload: { ttsEnabled: true, ttsBackend: 'browser' }
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tts/speak',
      headers,
      payload: { text: 'hello there', persona: 'general' }
    });

    expect(response.statusCode).toBe(403);
  });

  test('rejects an invalid body as 400', async () => {
    const app = buildApp({ authMode: 'proxy', db, keyVault, ttsConfig });
    const headers = await headersForNewUser('tts-invalid@example.com');

    const response = await app.inject({
      method: 'POST',
      url: '/api/tts/speak',
      headers,
      payload: { text: '', persona: 'general' }
    });

    expect(response.statusCode).toBe(400);
  });

  test('rejects with 403 when the user has no saved OpenAI BYOK key', async () => {
    const app = buildApp({ authMode: 'proxy', db, keyVault, ttsConfig });
    const headers = await headersForNewUser('tts-no-openai-key@example.com');
    await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers,
      payload: { ttsEnabled: true, ttsBackend: 'openai' }
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tts/speak',
      headers,
      payload: { text: 'hello there', persona: 'general' }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ title: expect.stringContaining('OpenAI API key') });
  });

  test('synthesizes audio with the user\'s saved OpenAI BYOK key', async () => {
    const fakeAudio = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(fakeMp3Response(fakeAudio)));
    vi.stubGlobal('fetch', fetchMock);

    const app = buildApp({ authMode: 'proxy', db, keyVault, ttsConfig });
    const headers = await headersForNewUser('tts-enabled@example.com');
    await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers,
      payload: { ttsEnabled: true, ttsBackend: 'openai' }
    });
    // Save an OpenAI BYOK key for this user — the TTS route resolves it
    // per-request and decrypts it with the same keyVault.
    await app.inject({
      method: 'PUT',
      url: '/api/users/me/llm-keys/openai',
      headers,
      payload: { apiKey: 'sk-byok-openai-tts' }
    });

    const text = 'a'.repeat(1000);
    const response = await app.inject({
      method: 'POST',
      url: '/api/tts/speak',
      headers,
      payload: { text, persona: 'gambler' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('audio/mpeg');
    expect(new Uint8Array(response.rawPayload)).toEqual(fakeAudio);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/speech',
      expect.objectContaining({ method: 'POST' })
    );
    const sentBody = JSON.parse(fetchMock.mock.calls[0]![1]?.body as string) as { voice: string; model: string };
    expect(sentBody).toEqual({ model: 'tts-1', voice: 'verse', input: text, response_format: 'mp3' });
    // The route decrypts the BYOK key and passes it as the Bearer token.
    const sentHeaders = fetchMock.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(sentHeaders.authorization).toBe('Bearer sk-byok-openai-tts');
  });
});

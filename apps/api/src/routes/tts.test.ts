import type { Kysely } from 'kysely';
import { afterEach, beforeAll, afterAll, describe, expect, test, vi } from 'vitest';
import { buildApp } from '../app.js';
import * as creditsRepo from '../db/repositories/credits.js';
import type { Database } from '../db/schema.js';
import type { TtsConfig } from '../services/tts.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';

const ttsConfig: TtsConfig = { apiKey: 'test-key', modelId: 'tts-1', creditsPer1kChars: 5 };

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
    // getOrCreate on first request also grants the signup credits this suite relies on.
    const app = buildApp({ authMode: 'proxy', db });
    await app.inject({ method: 'GET', url: '/api/users/me', headers });
    return headers;
  }

  test('rejects when the account has not enabled coach voice', async () => {
    const app = buildApp({ authMode: 'proxy', db, ttsConfig });
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
    const app = buildApp({ authMode: 'proxy', db, ttsConfig });
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
    const app = buildApp({ authMode: 'proxy', db, ttsConfig });
    const headers = await headersForNewUser('tts-invalid@example.com');

    const response = await app.inject({
      method: 'POST',
      url: '/api/tts/speak',
      headers,
      payload: { text: '', persona: 'general' }
    });

    expect(response.statusCode).toBe(400);
  });

  test('synthesizes audio, returns it, and debits credits + logs the call', async () => {
    const fakeAudio = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(fakeMp3Response(fakeAudio)));
    vi.stubGlobal('fetch', fetchMock);

    const app = buildApp({ authMode: 'proxy', db, ttsConfig });
    const headers = await headersForNewUser('tts-enabled@example.com');
    await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers,
      payload: { ttsEnabled: true, ttsBackend: 'openai' }
    });
    const profileResponse = await app.inject({ method: 'GET', url: '/api/users/me', headers });
    const userId = (profileResponse.json() as { id: string }).id;
    const balanceBefore = await creditsRepo.balance(db, userId);

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

    const balanceAfter = await creditsRepo.balance(db, userId);
    expect(balanceBefore - balanceAfter).toBe(5); // 1000 chars * 5 credits/1k chars

    const logRow = await db
      .selectFrom('llmCallLog')
      .selectAll()
      .where('userId', '=', userId)
      .where('purpose', '=', 'tts')
      .executeTakeFirstOrThrow();
    expect(logRow.provider).toBe('openai');
    expect(logRow.inputTokens).toBe(1000);
    expect(logRow.creditsMetered).toBe(5);
  });
});

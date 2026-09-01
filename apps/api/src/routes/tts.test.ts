import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { buildApp } from '../app.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { createUserSetupVault } from '../llm/key-vault.js';
import { createMemoryLlmUnlockStore } from '../llm/unlock-store.js';
import type { TtsConfig } from '../services/tts.js';

const ttsConfig: TtsConfig = { enabled: true };
const vault = createUserSetupVault();
const setup = { endpoint: 'https://provider.example/v1', apiKey: 'tts-secret', lowModel: 'luna', highModel: 'terra', voiceModel: 'gpt-4o-mini-tts' };

describe('POST /api/tts/speak', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => testDb.cleanup());
  afterEach(() => vi.unstubAllGlobals());

  test('requires an unlocked configured voice model', async () => {
    const app = buildApp({ authMode: 'proxy', db, llmSetupVault: vault, llmUnlockStore: createMemoryLlmUnlockStore({ pepper: 'tts-test', ttlSeconds: 60 }), ttsConfig });
    const headers = { 'x-auth-request-email': 'tts-no-setup@example.com', 'x-auth-request-user': 'Tester' };
    await app.inject({ method: 'GET', url: '/api/users/me', headers });
    await app.inject({ method: 'PATCH', url: '/api/users/me', headers, payload: { ttsEnabled: true, ttsBackend: 'openai' } });
    const response = await app.inject({ method: 'POST', url: '/api/tts/speak', headers, payload: { text: 'hello', persona: 'general' } });
    expect(response.statusCode).toBe(403);
    expect(response.json().title).toContain('Unlock');
  });

  test('uses the configured endpoint and voice model', async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      if (String(input).endsWith('/audio/speech')) return Promise.resolve(new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'content-type': 'audio/mpeg' } }));
      return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const unlockStore = createMemoryLlmUnlockStore({ pepper: 'tts-test-2', ttlSeconds: 60 });
    const app = buildApp({ authMode: 'proxy', db, llmSetupVault: vault, llmUnlockStore: unlockStore, ttsConfig });
    const headers = { 'x-auth-request-email': 'tts-configured@example.com', 'x-auth-request-user': 'Tester' };
    await app.inject({ method: 'GET', url: '/api/users/me', headers });
    await app.inject({ method: 'PATCH', url: '/api/users/me', headers, payload: { ttsEnabled: true, ttsBackend: 'openai' } });
    await app.inject({ method: 'PUT', url: '/api/users/me/llm-setup', headers, payload: { ...setup, unlockPhrase: 'correct horse battery staple' } });
    const response = await app.inject({ method: 'POST', url: '/api/tts/speak', headers, payload: { text: 'hello', persona: 'gambler' } });
    expect(response.statusCode).toBe(200);
    expect(new Uint8Array(response.rawPayload)).toEqual(new Uint8Array([1, 2]));
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toBe('https://provider.example/v1/audio/speech');
    expect(fetchMock.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ method: 'POST' }));
  });
});

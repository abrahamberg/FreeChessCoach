import { randomBytes } from 'node:crypto';
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
const setup = {
  endpoint: 'https://provider.example/v1',
  apiKey: 'test-secret-key',
  lowModel: 'luna',
  highModel: 'terra',
  voiceModel: 'gpt-4o-mini-tts'
};

describe('LLM setup routes', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  afterEach(() => vi.unstubAllGlobals());

  test('tests every configured model and saves only an encrypted setup after all probes pass', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/audio/speech')) return Promise.resolve(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'audio/mpeg' } }));
      return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 }));
    }));
    const unlockStore = createMemoryLlmUnlockStore({ pepper: 'test-pepper', ttlSeconds: 60 });
    const app = buildApp({ authMode: 'proxy', db, llmSetupVault: vault, llmUnlockStore: unlockStore, ttsConfig });
    const headers = { 'x-auth-request-email': 'setup-routes@example.com', 'x-auth-request-user': 'Setup' };

    const response = await app.inject({
      method: 'PUT',
      url: '/api/users/me/llm-setup',
      headers,
      payload: { ...setup, unlockPhrase: 'correct horse battery staple' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ configured: true, unlocked: true, lowModel: 'luna', highModel: 'terra', voiceAvailable: true });
    const row = await db.selectFrom('userLlmSetups').selectAll().executeTakeFirstOrThrow();
    expect(row.setupCiphertext.toString()).not.toContain(setup.apiKey);
    expect(vault.decrypt({ ciphertext: row.setupCiphertext, iv: row.setupIv, salt: row.setupSalt }, 'correct horse battery staple')).toMatchObject({ ...setup, protocol: 'openai-chat' });
    expect((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(3);
  });

  test('does not unlock with a wrong phrase and locks the temporary cache', async () => {
    const unlockStore = createMemoryLlmUnlockStore({ pepper: randomBytes(8).toString('hex'), ttlSeconds: 60 });
    const app = buildApp({ authMode: 'proxy', db, llmSetupVault: vault, llmUnlockStore: unlockStore, ttsConfig });
    const headers = { 'x-auth-request-email': 'setup-routes@example.com', 'x-auth-request-user': 'Setup' };
    const wrong = await app.inject({ method: 'POST', url: '/api/users/me/llm-setup/unlock', headers, payload: { unlockPhrase: 'wrong phrase' } });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().title).toContain('incorrect');

    const locked = await app.inject({ method: 'POST', url: '/api/users/me/llm-setup/lock', headers });
    expect(locked.statusCode).toBe(204);
    const status = await app.inject({ method: 'GET', url: '/api/users/me/llm-setup', headers });
    expect(status.json()).toMatchObject({ configured: true, unlocked: false, voiceAvailable: false });
  });
});

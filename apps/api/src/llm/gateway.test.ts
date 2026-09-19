import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as llmSetupsRepo from '../db/repositories/llm-setups.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { createMemoryLlmUnlockStore } from './unlock-store.js';
import { getModelForUser, type GatewayConfig } from './gateway.js';
import { ValidationError } from '../lib/errors.js';

const unlockStore = createMemoryLlmUnlockStore({ pepper: 'gateway-test', ttlSeconds: 60 });
const config: GatewayConfig = { unlockStore };

describe('llm gateway', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function makeUser(email: string): Promise<string> {
    const user = await usersRepo.insert(db, { email, displayName: email });
    return user.id;
  }

  test('sends a user who never saved a setup to Settings, not an unlock prompt', async () => {
    const userId = await makeUser('never-configured-user@example.com');
    await expect(getModelForUser(db, config, userId, 'standard')).rejects.toThrow(ValidationError);
    await expect(getModelForUser(db, config, userId, 'standard')).rejects.toThrow(/set up your ai/i);
  });

  test('requires an active unlock instead of decrypting from a database row', async () => {
    const userId = await makeUser('no-unlock-user@example.com');
    await llmSetupsRepo.upsert(db, userId, Buffer.from('ciphertext'), Buffer.from('iv'), Buffer.from('salt'));
    await expect(getModelForUser(db, config, userId, 'standard')).rejects.toThrow(ValidationError);
    await expect(getModelForUser(db, config, userId, 'standard')).rejects.toThrow(/unlock/i);
  });

  test('uses the active setup and selects the correct low/high model', async () => {
    const userId = await makeUser('unlocked-user@example.com');
    await unlockStore.unlock(userId, {
      endpoint: 'https://provider.example/v1',
      apiKey: 'secret',
      lowModel: 'luna',
      highModel: 'terra',
      voiceModel: undefined,
      protocol: 'openai-chat'
    });

    expect((await getModelForUser(db, config, userId, 'light')).modelId).toBe('luna');
    expect((await getModelForUser(db, config, userId, 'standard')).modelId).toBe('terra');
  });

  test('a setup that opted into flex resolves OpenAI calls to the flex service tier', async () => {
    const userId = await makeUser('flex-user@example.com');
    await unlockStore.unlock(userId, {
      endpoint: 'https://api.openai.com/v1',
      apiKey: 'secret',
      lowModel: 'luna',
      highModel: 'terra',
      voiceModel: undefined,
      protocol: 'openai-responses',
      useFlex: true
    });

    const resolution = await getModelForUser(db, config, userId, 'standard');
    expect(resolution.usesFlex).toBe(true);
    expect(resolution.callOptions.providerOptions?.openai?.serviceTier).toBe('flex');
  });

  test('a setup without the flex flag keeps the deployment service tier', async () => {
    const userId = await makeUser('no-flex-user@example.com');
    await unlockStore.unlock(userId, {
      endpoint: 'https://api.openai.com/v1',
      apiKey: 'secret',
      lowModel: 'luna',
      highModel: 'terra',
      voiceModel: undefined,
      protocol: 'openai-responses'
    });

    const resolution = await getModelForUser(db, config, userId, 'standard');
    expect(resolution.usesFlex).toBe(false);
    expect(resolution.callOptions.providerOptions?.openai?.serviceTier).toBe('auto');
  });

  test('flex never applies to an Anthropic setup', async () => {
    const userId = await makeUser('flex-anthropic-user@example.com');
    await unlockStore.unlock(userId, {
      endpoint: 'https://api.anthropic.com/v1',
      apiKey: 'secret',
      lowModel: 'haiku',
      highModel: 'sonnet',
      voiceModel: undefined,
      protocol: 'anthropic',
      useFlex: true
    });

    const resolution = await getModelForUser(db, config, userId, 'standard');
    expect(resolution.usesFlex).toBe(false);
  });

  test('fake mode still avoids the unlock store', async () => {
    const fakeConfig: GatewayConfig = { ...config, fake: true };
    const resolution = await getModelForUser(db, fakeConfig, 'nonexistent-user-id', 'standard');
    expect(resolution.model).toBeDefined();
  });
});

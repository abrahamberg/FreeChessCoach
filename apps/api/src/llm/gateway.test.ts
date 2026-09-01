import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
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

  test('requires an active unlock instead of decrypting from a database row', async () => {
    const userId = await makeUser('no-unlock-user@example.com');
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

  test('fake mode still avoids the unlock store', async () => {
    const fakeConfig: GatewayConfig = { ...config, fake: true };
    const resolution = await getModelForUser(db, fakeConfig, 'nonexistent-user-id', 'standard');
    expect(resolution.model).toBeDefined();
  });
});

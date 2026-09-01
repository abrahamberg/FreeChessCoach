import { randomBytes } from 'node:crypto';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as usersRepo from '../db/repositories/users.js';
import * as llmKeysRepo from '../db/repositories/llm-keys.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { createKeyVault } from './key-vault.js';
import { getModelForUser, type GatewayConfig } from './gateway.js';
import { ValidationError } from '../lib/errors.js';

const config: GatewayConfig = {
  keyVault: createKeyVault(randomBytes(32).toString('base64')),
  modelIds: {
    standard: { anthropic: 'claude-standard', openai: 'gpt-standard' },
    light: { anthropic: 'claude-light', openai: 'gpt-light' }
  }
};

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

  describe('getModelForUser', () => {
    test('throws a ValidationError directing to Settings when the user has no BYOK key', async () => {
      const userId = await makeUser('no-key-user@example.com');

      await expect(getModelForUser(db, config, userId, 'standard')).rejects.toThrow(ValidationError);
      await expect(getModelForUser(db, config, userId, 'standard')).rejects.toThrow(/Settings/i);
    });

    test('uses the user\'s BYOK key', async () => {
      const userId = await makeUser('byok-user@example.com');
      const { ciphertext, iv } = config.keyVault.encrypt('sk-ant-byok-secret');
      await llmKeysRepo.upsert(db, userId, 'openai', ciphertext, iv);

      const resolution = await getModelForUser(db, config, userId, 'light');

      expect(resolution.provider).toBe('openai');
      expect(resolution.model).toBeDefined();
    });

    test('prefers anthropic when the user has BYOK keys for both providers', async () => {
      const userId = await makeUser('both-keys-user@example.com');
      const anthropicKey = config.keyVault.encrypt('sk-ant-1');
      const openaiKey = config.keyVault.encrypt('sk-oai-1');
      await llmKeysRepo.upsert(db, userId, 'openai', openaiKey.ciphertext, openaiKey.iv);
      await llmKeysRepo.upsert(db, userId, 'anthropic', anthropicKey.ciphertext, anthropicKey.iv);

      const resolution = await getModelForUser(db, config, userId, 'standard');

      expect(resolution.provider).toBe('anthropic');
    });

    test('config.fake short-circuits to a canned model, never touching keys or the DB', async () => {
      const fakeConfig: GatewayConfig = { ...config, fake: true };

      const resolution = await getModelForUser(db, fakeConfig, 'nonexistent-user-id', 'standard');

      expect(resolution.model).toBeDefined();
    });
  });
});

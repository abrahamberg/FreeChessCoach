import {
  LlmSetupSchema,
  SaveLlmSetupRequestSchema,
  UnlockLlmSetupRequestSchema,
  type LlmSetup,
  type LlmSetupTestResponse,
  type StoredLlmSetup
} from '@freechesscoach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import * as llmSetupsRepo from '../db/repositories/llm-setups.js';
import type { Database } from '../db/schema.js';
import type { UserSetupVault } from '../llm/key-vault.js';
import { testLlmSetup } from '../llm/compatibility-test.js';
import type { LlmUnlockStore } from '../llm/unlock-store.js';
import { ValidationError } from '../lib/errors.js';
import * as userProfileService from '../services/user-profile.js';

export function registerLlmSetupRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  vault: UserSetupVault,
  unlockStore: LlmUnlockStore
): void {
  app.get('/api/users/me/llm-setup', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const row = await llmSetupsRepo.findByUser(db, user.id);
    const setup = await unlockStore.get(user.id);
    return statusFor(row !== undefined, setup);
  });

  app.post('/api/users/me/llm-setup/test', async (request) => {
    const setup = parseSetup(request.body);
    return testLlmSetup(setup);
  });

  app.put('/api/users/me/llm-setup', async (request) => {
    const parsed = SaveLlmSetupRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(formatIssues(parsed.error.issues));

    const { unlockPhrase, ...setup } = parsed.data;
    const tests = await testLlmSetup(setup);
    assertTestsPassed(tests);
    const storedSetup: StoredLlmSetup = { ...setup, protocol: tests.protocol };
    const encrypted = vault.encrypt(storedSetup, unlockPhrase);
    const user = await userProfileService.getOrCreate(db, request.user);
    await unlockStore.lock(user.id);
    await llmSetupsRepo.upsert(db, user.id, encrypted.ciphertext, encrypted.iv, encrypted.salt);
    await unlockStore.unlock(user.id, storedSetup);
    return statusFor(true, storedSetup);
  });

  app.post('/api/users/me/llm-setup/unlock', async (request) => {
    const parsed = UnlockLlmSetupRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(formatIssues(parsed.error.issues));
    const user = await userProfileService.getOrCreate(db, request.user);
    const row = await llmSetupsRepo.findByUser(db, user.id);
    if (!row) throw new ValidationError('Save an AI setup before unlocking it.');

    let setup: StoredLlmSetup;
    try {
      setup = vault.decrypt(
        { ciphertext: row.setupCiphertext, iv: row.setupIv, salt: row.setupSalt },
        parsed.data.unlockPhrase
      );
    } catch {
      throw new ValidationError('That unlock phrase is incorrect.');
    }
    await unlockStore.unlock(user.id, setup);
    return statusFor(true, setup);
  });

  app.post('/api/users/me/llm-setup/lock', async (request, reply) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    await unlockStore.lock(user.id);
    return reply.code(204).send();
  });

  app.delete('/api/users/me/llm-setup', async (request, reply) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    await unlockStore.lock(user.id);
    await llmSetupsRepo.remove(db, user.id);
    return reply.code(204).send();
  });
}

function parseSetup(body: unknown): LlmSetup {
  const parsed = LlmSetupSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(formatIssues(parsed.error.issues));
  return parsed.data;
}

function assertTestsPassed(tests: LlmSetupTestResponse): asserts tests is LlmSetupTestResponse & { protocol: StoredLlmSetup['protocol']; low: { ok: true }; high: { ok: true } } {
  const failures = [
    tests.low.ok ? null : `low model: ${tests.low.error ?? 'test failed'}`,
    tests.high.ok ? null : `high model: ${tests.high.error ?? 'test failed'}`,
    tests.voice && !tests.voice.ok ? `voice model: ${tests.voice.error ?? 'test failed'}` : null
  ].filter((failure): failure is string => failure !== null);
  if (tests.protocol === null || failures.length > 0) {
    throw new ValidationError(failures.join('; ') || 'The endpoint did not match an OpenAI or Anthropic API format.');
  }
}

function statusFor(configured: boolean, setup: StoredLlmSetup | null): object {
  return {
    configured,
    unlocked: setup !== null,
    ...(setup
      ? {
          endpoint: setup.endpoint,
          protocol: setup.protocol,
          lowModel: setup.lowModel,
          highModel: setup.highModel,
          ...(setup.voiceModel ? { voiceModel: setup.voiceModel } : {})
        }
      : {}),
    voiceAvailable: setup?.voiceModel !== undefined
  };
}

function formatIssues(issues: readonly { message: string }[]): string {
  return issues.map((issue) => issue.message).join('; ');
}

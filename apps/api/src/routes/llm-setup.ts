import {
  LlmSetupSchema,
  LocalModelsRequestSchema,
  SaveLlmSetupRequestSchema,
  UnlockLlmSetupRequestSchema,
  type LlmModelsResponse,
  type LlmSetup,
  type StoredLlmSetup
} from '@freechesscoach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import * as llmSetupsRepo from '../db/repositories/llm-setups.js';
import type { Database } from '../db/schema.js';
import type { UserSetupVault } from '../llm/key-vault.js';
import { testLlmSetup } from '../llm/compatibility-test.js';
import { fetchLocalModels } from '../llm/local-compatibility-test.js';
import type { LlmUnlockStore } from '../llm/unlock-store.js';
import { ValidationError } from '../lib/errors.js';
import * as userProfileService from '../services/user-profile.js';
import type { LlmTunnelTransport } from '../services/engine/llm-tunnel-transport.js';
import { ROUTE_RATE_LIMITS, rateLimitConfig } from '../plugins/route-rate-limit.js';
import { registerLlmSetupEditRoutes } from './llm-setup-edit.js';
import { assertStrongUnlockPhrase, assertTestsPassed, formatIssues, statusFor, withDetectedProtocols } from './llm-setup-status.js';

export function registerLlmSetupRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  vault: UserSetupVault,
  unlockStore: LlmUnlockStore,
  llmTunnelTransport?: LlmTunnelTransport
): void {
  app.get('/api/users/me/llm-setup', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const row = await llmSetupsRepo.findByUser(db, user.id);
    const setup = await unlockStore.get(user.id);
    return statusFor(row !== undefined, setup);
  });

  app.post('/api/users/me/llm-setup/test', rateLimitConfig(ROUTE_RATE_LIMITS.llmSetupProbe), async (request) => {
    const setup = parseSetup(request.body);
    const user = await userProfileService.getOrCreate(db, request.user);
    return testLlmSetup(setup, llmTunnelTransport, user.id);
  });

  // POST, not GET: a local server's token travels in the body, never the URL.
  // Its own, looser cap: the listing runs in the user's own tab (tunnel ->
  // their local server), and the settings form refetches it as it's edited.
  app.post('/api/users/me/llm-setup/models', rateLimitConfig(ROUTE_RATE_LIMITS.llmLocalModels), async (request): Promise<LlmModelsResponse> => {
    const parsed = LocalModelsRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(formatIssues(parsed.error.issues));
    const empty = { models: [], loadedModel: null, contextLength: null };
    if (!llmTunnelTransport) return { ...empty, error: 'Local AI is not available on this server.' };
    const user = await userProfileService.getOrCreate(db, request.user);
    try {
      return await fetchLocalModels(llmTunnelTransport, user.id, parsed.data.endpoint, parsed.data.token);
    } catch (error) {
      return { ...empty, error: error instanceof Error ? error.message : String(error) };
    }
  });

  app.put('/api/users/me/llm-setup', rateLimitConfig(ROUTE_RATE_LIMITS.llmSetupProbe), async (request) => {
    const parsed = SaveLlmSetupRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(formatIssues(parsed.error.issues));

    const { unlockPhrase, ...setup } = parsed.data;
    const user = await userProfileService.getOrCreate(db, request.user);
    await assertStrongUnlockPhrase(unlockPhrase, user);
    const tests = await testLlmSetup(setup, llmTunnelTransport, user.id);
    assertTestsPassed(tests);
    const storedSetup = withDetectedProtocols(setup, tests);
    const encrypted = await vault.encrypt(storedSetup, unlockPhrase);
    await unlockStore.lock(user.id);
    await llmSetupsRepo.upsert(db, user.id, encrypted.ciphertext, encrypted.iv, encrypted.salt);
    await unlockStore.unlock(user.id, storedSetup);
    return statusFor(true, storedSetup);
  });

  app.post('/api/users/me/llm-setup/unlock', rateLimitConfig(ROUTE_RATE_LIMITS.llmSetupUnlock), async (request) => {
    const parsed = UnlockLlmSetupRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(formatIssues(parsed.error.issues));
    const user = await userProfileService.getOrCreate(db, request.user);
    const row = await llmSetupsRepo.findByUser(db, user.id);
    if (!row) throw new ValidationError('Save an AI setup before unlocking it.');

    let setup: StoredLlmSetup;
    try {
      setup = await vault.decrypt(
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

  registerLlmSetupEditRoutes(app, db, vault, unlockStore, llmTunnelTransport);
}

function parseSetup(body: unknown): LlmSetup {
  const parsed = LlmSetupSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(formatIssues(parsed.error.issues));
  return parsed.data;
}


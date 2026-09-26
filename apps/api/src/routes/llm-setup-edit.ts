import {
  CloudModelsRequestSchema,
  LlmModelsChangeSchema,
  UpdateLlmModelsRequestSchema,
  cloudProviderOf,
  type CloudModelsResponse,
  type KnownCloudProvider,
  type LlmModelsChange,
  type LlmSetupTestResponse,
  type LlmSetupStatus,
  type StoredLlmSetup
} from '@freechesscoach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import * as llmSetupsRepo from '../db/repositories/llm-setups.js';
import type { Database } from '../db/schema.js';
import { fetchCloudModels } from '../llm/cloud-models.js';
import { testLlmSetup } from '../llm/compatibility-test.js';
import type { UserSetupVault } from '../llm/key-vault.js';
import type { LlmUnlockStore } from '../llm/unlock-store.js';
import { ValidationError } from '../lib/errors.js';
import { ROUTE_RATE_LIMITS, rateLimitConfig } from '../plugins/route-rate-limit.js';
import * as userProfileService from '../services/user-profile.js';
import type { LlmTunnelTransport } from '../services/engine/llm-tunnel-transport.js';
import { assertStrongUnlockPhrase, assertTestsPassed, formatIssues, statusFor, withDetectedProtocols } from './llm-setup-status.js';

/** Changing a saved setup's models without re-entering the key, and listing a named provider's models for the setup form. */
export function registerLlmSetupEditRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  vault: UserSetupVault,
  unlockStore: LlmUnlockStore,
  llmTunnelTransport?: LlmTunnelTransport
): void {
  // The Change models wizard's test step: the new models against the saved
  // endpoint and key, from the unlocked cache (no phrase yet — the save asks
  // for it and tests again). Nothing is stored.
  app.post('/api/users/me/llm-setup/test-models', rateLimitConfig(ROUTE_RATE_LIMITS.llmSetupProbe), async (request): Promise<LlmSetupTestResponse> => {
    const parsed = LlmModelsChangeSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(formatIssues(parsed.error.issues));
    const user = await userProfileService.getOrCreate(db, request.user);
    const setup = await unlockStore.get(user.id);
    if (!setup) throw new ValidationError('Unlock your AI setup first, then change its models.');
    return testLlmSetup(withModels(setup, parsed.data), llmTunnelTransport, user.id);
  });

  // Opens the saved setup with the phrase (the database copy is the source
  // of truth, locked or not), re-tests the new models with the saved endpoint
  // and key, and re-encrypts under a fresh salt — with the new phrase if one
  // was given. Endpoint and key are not in the body, so they can't change.
  // The unlock limit, not the probe one: this is also a phrase check.
  app.patch('/api/users/me/llm-setup', rateLimitConfig(ROUTE_RATE_LIMITS.llmSetupUnlock), async (request): Promise<LlmSetupStatus> => {
    const parsed = UpdateLlmModelsRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(formatIssues(parsed.error.issues));
    const { unlockPhrase, newUnlockPhrase, ...change } = parsed.data;
    const user = await userProfileService.getOrCreate(db, request.user);
    const row = await llmSetupsRepo.findByUser(db, user.id);
    if (!row) throw new ValidationError('There is no saved AI setup to change.');
    if (newUnlockPhrase) await assertStrongUnlockPhrase(newUnlockPhrase, user);

    let saved: StoredLlmSetup;
    try {
      saved = await vault.decrypt({ ciphertext: row.setupCiphertext, iv: row.setupIv, salt: row.setupSalt }, unlockPhrase);
    } catch {
      throw new ValidationError('That unlock phrase is incorrect.');
    }
    const updated = withModels(saved, change);
    const tests = await testLlmSetup(updated, llmTunnelTransport, user.id);
    assertTestsPassed(tests);
    const storedSetup = withDetectedProtocols(updated, tests);
    const encrypted = await vault.encrypt(storedSetup, newUnlockPhrase ?? unlockPhrase);
    await unlockStore.lock(user.id);
    await llmSetupsRepo.upsert(db, user.id, encrypted.ciphertext, encrypted.iv, encrypted.salt);
    await unlockStore.unlock(user.id, storedSetup);
    return statusFor(true, storedSetup);
  });

  // POST: a typed key travels in the body, never the URL.
  app.post('/api/users/me/llm-setup/cloud-models', rateLimitConfig(ROUTE_RATE_LIMITS.llmCloudModels), async (request): Promise<CloudModelsResponse> => {
    const parsed = CloudModelsRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(formatIssues(parsed.error.issues));
    const user = await userProfileService.getOrCreate(db, request.user);
    const apiKey = parsed.data.apiKey ?? savedKeyFor(await unlockStore.get(user.id), parsed.data.provider);
    if (!apiKey) return { models: [], voiceModels: [], error: 'Enter your API key to list its models.' };
    return fetchCloudModels(parsed.data.provider, apiKey);
  });
}

/** The saved key, only when the saved setup is on this same provider. */
function savedKeyFor(setup: StoredLlmSetup | null, provider: KnownCloudProvider): string | undefined {
  if (!setup || setup.protocol === 'local' || cloudProviderOf(setup.endpoint) !== provider) return undefined;
  return setup.apiKey;
}

/** The saved setup with the new models. A local setup has no voice or Flex. */
function withModels(setup: StoredLlmSetup, change: LlmModelsChange): StoredLlmSetup {
  const isLocal = setup.protocol === 'local';
  return {
    ...setup,
    lowModel: change.lowModel,
    highModel: change.highModel,
    voiceModel: isLocal ? undefined : change.voiceModel,
    useFlex: isLocal ? undefined : change.useFlex,
    reasoning: change.reasoning
  };
}

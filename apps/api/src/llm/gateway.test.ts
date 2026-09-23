import type { StoredLlmSetup } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { describe, expect, test } from 'vitest';
import type { Database } from '../db/schema.js';
import type { LlmTunnelTransport } from '../services/engine/llm-tunnel-transport.js';
import { getModelForUser, streamTimeoutsFor, type GatewayConfig } from './gateway.js';
import { DEFAULT_LOCAL_LLM_TIMEOUTS, DEFAULT_MODEL_TUNING } from './model-options.js';
import { createMemoryLlmUnlockStore } from './unlock-store.js';

const db = {} as Kysely<Database>;
const transport: LlmTunnelTransport = { request: async () => ({}), stream: async function* () {} };

async function configWith(setup: StoredLlmSetup): Promise<GatewayConfig> {
  const unlockStore = createMemoryLlmUnlockStore({ pepper: 'test-pepper-test-pepper-test-pepper', ttlSeconds: 60 });
  await unlockStore.unlock('u', setup);
  return { unlockStore, llmTunnelTransport: transport };
}

const CLOUD: StoredLlmSetup = {
  protocol: 'anthropic',
  endpoint: 'https://openrouter.ai/api/v1',
  apiKey: 'k',
  lowModel: 'openai/gpt-5.6-luna',
  highModel: 'anthropic/claude-sonnet-5'
};

const LOCAL: StoredLlmSetup = {
  protocol: 'local',
  localType: 'lm-studio',
  endpoint: 'http://localhost:1234/v1',
  lowModel: 'qwen3',
  highModel: 'qwen3'
};

describe('getModelForUser', () => {
  test('a setup without a thinking level uses the deployment tuning per tier', async () => {
    const config = await configWith(CLOUD);
    const standard = await getModelForUser(db, config, 'u', 'standard');
    const light = await getModelForUser(db, config, 'u', 'light');
    expect(standard.callOptions.reasoning).toBe(DEFAULT_MODEL_TUNING.reasoning.standard);
    expect(light.callOptions.reasoning).toBe(DEFAULT_MODEL_TUNING.reasoning.light);
  });

  test('the user’s thinking level wins for its own tier only', async () => {
    const config = await configWith({ ...CLOUD, reasoning: { standard: 'high' } });
    expect((await getModelForUser(db, config, 'u', 'standard')).callOptions.reasoning).toBe('high');
    expect((await getModelForUser(db, config, 'u', 'light')).callOptions.reasoning).toBe(DEFAULT_MODEL_TUNING.reasoning.light);
  });

  test('each tier uses its own detected protocol, falling back to the shared one', async () => {
    const config = await configWith({ ...CLOUD, lowProtocol: 'openai-responses', highProtocol: 'anthropic' });
    expect((await getModelForUser(db, config, 'u', 'light')).provider).toBe('openai');
    expect((await getModelForUser(db, config, 'u', 'standard')).provider).toBe('anthropic');
    const legacy = await configWith(CLOUD);
    expect((await getModelForUser(db, legacy, 'u', 'light')).provider).toBe('anthropic');
  });

  test('a local model thinks with Off by default and gets the local stall guards', async () => {
    const config = await configWith(LOCAL);
    const resolution = await getModelForUser(db, config, 'u', 'standard');
    expect(resolution.isLocal).toBe(true);
    expect(resolution.callOptions).toEqual({ reasoning: 'none' });
    expect(streamTimeoutsFor(config, resolution)).toEqual({
      firstChunkMs: DEFAULT_LOCAL_LLM_TIMEOUTS.requestTimeoutMs,
      chunkMs: DEFAULT_LOCAL_LLM_TIMEOUTS.streamIdleMs
    });
  });
});

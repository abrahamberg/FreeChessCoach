import { pathToFileURL } from 'node:url';
import { buildApp } from './app.js';
import {
  buildCoachAgentBaseDependencies,
  buildGatewayConfigFromEnv,
  buildResolveEngineBackendOptions,
  buildTtsConfigFromEnv,
  openLichessEvalIndexFromEnv,
  requireEnv,
  requireInternalToken,
  buildLlmUnlockStoreFromEnv,
  buildRatingEvalStoreFromEnv,
  buildBotThinkingRegistryFromEnv
} from './bootstrap.js';
import { createDb } from './db/index.js';
import { createGraphileJobQueue } from './jobs/queue.js';
import { createUserSetupVault } from './llm/key-vault.js';
import { openPuzzlePoolFromEnv } from './services/puzzle-pool.js';
import { buildBrowserTunnel } from './services/engine/browser-tunnel.js';

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}

async function main(): Promise<void> {
  const connectionString = requireEnv('DATABASE_URL');
  const db = createDb(connectionString);
  const llmUnlockStore = buildLlmUnlockStoreFromEnv();
  const engineUrl = requireEnv('ENGINE_URL');

  const { queue: jobQueue } = await createGraphileJobQueue(connectionString);
  const tunnel = buildBrowserTunnel();
  const lichessEvalIndex = await openLichessEvalIndexFromEnv();
  const engineBackendOptions = buildResolveEngineBackendOptions(db, engineUrl, tunnel.engineTransport, lichessEvalIndex);
  const puzzlePool = await openPuzzlePoolFromEnv();
  const gatewayConfig = buildGatewayConfigFromEnv(llmUnlockStore, tunnel.llmTransport);
  const coachAgentBaseDeps = buildCoachAgentBaseDependencies(db, jobQueue, gatewayConfig, puzzlePool?.all() ?? null);
  const ttsConfig = buildTtsConfigFromEnv();

  const app = buildApp({
    logger: true,
    db,
    jobQueue,
    llmSetupVault: createUserSetupVault(),
    llmUnlockStore,
    coachAgentBaseDeps,
    engineBackendOptions,
    botRatingEvals: buildRatingEvalStoreFromEnv(),
    botThinkingLog: buildBotThinkingRegistryFromEnv(),
    tunnel,
    internalToken: requireInternalToken(),
    ttsConfig
  });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
}

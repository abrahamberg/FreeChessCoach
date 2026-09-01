import { pathToFileURL } from 'node:url';
import { buildApp } from './app.js';
import {
  buildCoachAgentBaseDependencies,
  buildGatewayConfigFromEnv,
  buildResolveEngineBackendOptions,
  buildTtsConfigFromEnv,
  openLichessEvalIndexFromEnv,
  requireEnv,
  buildLlmUnlockStoreFromEnv
} from './bootstrap.js';
import { createDb } from './db/index.js';
import { createGraphileJobQueue } from './jobs/queue.js';
import { createUserSetupVault } from './llm/key-vault.js';
import { EngineTunnelRegistry } from './services/engine/engine-tunnel-registry.js';

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
  const gatewayConfig = buildGatewayConfigFromEnv(llmUnlockStore);
  const engineUrl = requireEnv('ENGINE_URL');

  const { queue: jobQueue } = await createGraphileJobQueue(connectionString);
  const engineTunnelRegistry = new EngineTunnelRegistry();
  const lichessEvalIndex = await openLichessEvalIndexFromEnv();
  const engineBackendOptions = buildResolveEngineBackendOptions(db, engineUrl, engineTunnelRegistry, lichessEvalIndex);
  const coachAgentBaseDeps = buildCoachAgentBaseDependencies(db, jobQueue, gatewayConfig);
  const ttsConfig = buildTtsConfigFromEnv();

  const app = buildApp({
    db,
    jobQueue,
    llmSetupVault: createUserSetupVault(),
    llmUnlockStore,
    coachAgentBaseDeps,
    engineBackendOptions,
    engineTunnelRegistry,
    internalToken: requireEnv('ENGINE_TUNNEL_INTERNAL_TOKEN'),
    ttsConfig
  });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
}

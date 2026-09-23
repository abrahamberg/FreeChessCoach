import { run } from 'graphile-worker';
import {
  buildGatewayConfigFromEnv,
  buildResolveEngineBackendOptions,
  openLichessEvalIndexFromEnv,
  requireEnv,
  buildLlmUnlockStoreFromEnv
} from './bootstrap.js';
import { createDb } from './db/index.js';
import { createTaskList } from './jobs/index.js';
import { RelayEngineTunnelTransport } from './services/engine/relay-engine-tunnel-transport.js';
import { RelayLlmTunnelTransport } from './services/engine/relay-llm-tunnel-transport.js';
import { openPuzzlePoolFromEnv } from './services/puzzle-pool.js';

async function main(): Promise<void> {
  const connectionString = requireEnv('DATABASE_URL');
  const db = createDb(connectionString);
  const llmUnlockStore = buildLlmUnlockStoreFromEnv();
  const engineUrl = requireEnv('ENGINE_URL');

  const relayOptions = {
    apiInternalUrl: requireEnv('API_INTERNAL_URL'),
    internalToken: requireEnv('ENGINE_TUNNEL_INTERNAL_TOKEN')
  };
  const tunnelTransport = new RelayEngineTunnelTransport(relayOptions);
  // Local-LLM setups reach the user's tab through the api process too.
  const gatewayConfig = buildGatewayConfigFromEnv(llmUnlockStore, new RelayLlmTunnelTransport(relayOptions));
  const lichessEvalIndex = await openLichessEvalIndexFromEnv();
  const engineBackendOptions = buildResolveEngineBackendOptions(db, engineUrl, tunnelTransport, lichessEvalIndex, true);
  const puzzlePool = await openPuzzlePoolFromEnv();

  const taskList = createTaskList({
    db,
    engineBackendOptions,
    gatewayConfig,
    puzzlePool: puzzlePool?.all() ?? null
  });

  const runner = await run({ connectionString, taskList });
  await runner.promise;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
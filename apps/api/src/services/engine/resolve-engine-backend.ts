import type { Kysely } from 'kysely';
import * as usersRepo from '../../db/repositories/users.js';
import type { Database } from '../../db/schema.js';
import { EngineUnavailableError } from '../../lib/errors.js';
import { BrowserTunnelEngineBackend } from './browser-tunnel-engine-backend.js';
import { CachingEngineBackend } from './caching-engine-backend.js';
import type { EngineBackend } from './engine-backend.js';
import type { EngineTunnelTransport } from './engine-tunnel-transport.js';
import { NativeEngineBackend } from './native-engine-backend.js';

export interface ResolveEngineBackendOptions {
  db: Kysely<Database>;
  engineUrl: string;
  tunnelTransport: EngineTunnelTransport;
  tunnelTimeoutMs: number;
}

/**
 * Reads the user's engineMode and returns the right EngineBackend, wrapped
 * in CachingEngineBackend so every caller gets caching uniformly. Replaces
 * bootstrap-time wiring — call this fresh per session/job/request rather
 * than once at process start (design spec §3).
 */
export async function resolveEngineBackend(options: ResolveEngineBackendOptions, userId: string): Promise<EngineBackend> {
  const { raw, mode } = await resolveRawBackendForUser(options, userId);
  return new CachingEngineBackend(options.db, raw, { isExternalSource: mode === 'browser' });
}

/**
 * Same backend selection as resolveEngineBackend, but WITHOUT the
 * CachingEngineBackend wrapper — for the "Play vs Bot" bot move-selection
 * engine, which searches at a shallow, level-dependent depth/multiPv that
 * must never collide with or pollute the standard-depth cache every other
 * caller shares (position_evaluations is keyed by `fen` alone, with no
 * depth/multiPv discrimination — see ENGINE_DEFAULT_DEPTH's doc comment in
 * packages/shared/src/constants.ts). Bot search is cheap enough that not
 * caching it is a deliberate simplification, not a missed optimization.
 */
export async function resolveRawEngineBackend(options: ResolveEngineBackendOptions, userId: string): Promise<EngineBackend> {
  const { raw } = await resolveRawBackendForUser(options, userId);
  return raw;
}

async function resolveRawBackendForUser(
  options: ResolveEngineBackendOptions,
  userId: string
): Promise<{ raw: EngineBackend; mode: 'native' | 'browser' }> {
  const user = await usersRepo.findById(options.db, userId);
  if (!user) throw new EngineUnavailableError(`Unknown user ${userId}`);

  const mode = user.engineMode;
  const raw: EngineBackend =
    mode === 'browser'
      ? new BrowserTunnelEngineBackend(options.tunnelTransport, userId, options.tunnelTimeoutMs)
      : new NativeEngineBackend(options.engineUrl);

  return { raw, mode };
}

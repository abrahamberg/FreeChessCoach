import { computePositionFeatures } from '@freechesscoach/chess-analysis';
import type { EngineTunnelPayload, FetchTunnelPayload } from '@freechesscoach/shared';
import { getSharedEngineWorker, getSharedLiteEngineWorker } from './shared-engine-worker-instance.js';
import { analyzePositionsInBrowser, toEngineLine } from './browser-analyze.js';
import { getBrowserEngineDepth } from './browser-engine-depth.js';
import type { SharedEngineWorker } from './shared-engine-worker.js';

/** Answers the server's `engine` tunnel requests with the same
 * SharedEngineWorker the Explore panel uses: `lite` for the lite supplement
 * (every engine mode), `main` for Browser mode's own engine. */
export function runEngineRequest(payload: EngineTunnelPayload): Promise<unknown> {
  const depth = effectiveDepth(payload);
  if (payload.subKind === 'analyze-game') {
    return analyzeGameForTunnel(payload.fens, depth, payload.multiPv, payload.engine);
  }
  return analyzePositionForTunnel(payload.fen, depth, payload.multiPv, payload.engine, payload.movetimeMs);
}

/** The user's per-device depth for the full-net engine overrides the
 * server's. Lite requests (fixed hint depths) and time-capped requests (a
 * live bot move someone is waiting on) are left alone. */
function effectiveDepth(payload: EngineTunnelPayload): number {
  const isMain = payload.engine !== 'lite';
  const timeCapped = payload.subKind === 'analyze-position' && payload.movetimeMs !== undefined;
  return (isMain && !timeCapped && getBrowserEngineDepth()) || payload.depth;
}

/** Answers a `fetch` tunnel request (chess-api.com in chess_api mode). */
export function runFetchRequest(payload: FetchTunnelPayload): Promise<unknown> {
  return fetchForTunnel(payload.url, payload.method, payload.body);
}

/** Absent `engine` (a caller that hasn't opted in) means 'main', the
 * full-net worker. */
function workerForEngine(engine: EngineTunnelPayload['engine']): SharedEngineWorker {
  return engine === 'lite' ? getSharedLiteEngineWorker() : getSharedEngineWorker();
}

async function analyzePositionForTunnel(
  fen: string,
  depth: number,
  multiPv: number,
  engine: EngineTunnelPayload['engine'],
  movetimeMs: number | undefined
) {
  const lines = await workerForEngine(engine).analyze({ fen, depth, multiPv, movetimeMs });
  const positionLines = lines.map((line) => toEngineLine(fen, line));
  const best = positionLines[0];
  return {
    fen,
    depth,
    multiPv: positionLines.length,
    bestMove: best?.moveSan ?? null,
    eval: { cp: best?.cp ?? null, mateIn: best?.mateIn ?? null },
    lines: positionLines,
    features: computePositionFeatures(fen)
  };
}

function analyzeGameForTunnel(fens: string[], depth: number, multiPv: number, engine: EngineTunnelPayload['engine']) {
  return analyzePositionsInBrowser(workerForEngine(engine), fens, depth, multiPv);
}

/** Performs the actual outbound call from this tab, so it lands on the
 * third party from this user's own IP rather than the server's. Response
 * body is handed back as text, untouched — apps/api's own ChessApiEngineBackend
 * does the JSON parsing/validation it already does for a direct server
 * fetch, so nothing about that logic needs to know its fetch was tunneled. */
/** The only host a `fetch` tunnel request exists for. The tab runs these on
 * the server's behalf, so it refuses anything else: otherwise one forged
 * tunnel message could make this tab call the app's own API with the user's
 * cookies, or probe their local network, and hand back the answer. */
const TUNNEL_FETCH_ORIGIN = 'https://chess-api.com';

export function isAllowedTunnelFetchUrl(url: string): boolean {
  try {
    return new URL(url).origin === TUNNEL_FETCH_ORIGIN;
  } catch {
    return false;
  }
}

async function fetchForTunnel(url: string, method: string, body: string | undefined) {
  if (!isAllowedTunnelFetchUrl(url)) throw new Error(`Refusing tunnel fetch to ${url}`);
  const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body, credentials: 'omit' });
  return { status: response.status, body: await response.text() };
}

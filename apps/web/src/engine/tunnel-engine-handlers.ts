import { computePositionFeatures } from '@freechesscoach/chess-analysis';
import type { EngineTunnelPayload, FetchTunnelPayload } from '@freechesscoach/shared';
import { Chess } from 'chess.js';
import { getSharedEngineWorker, getSharedLiteEngineWorker } from './shared-engine-worker-instance.js';
import type { RawEngineLine, SharedEngineWorker } from './shared-engine-worker.js';

/** Answers the server's `engine` tunnel requests with the same
 * SharedEngineWorker the Explore panel uses: `lite` for the lite supplement
 * (every engine mode), `main` for Browser mode's own engine. */
export function runEngineRequest(payload: EngineTunnelPayload): Promise<unknown> {
  if (payload.subKind === 'analyze-game') {
    return analyzeGameForTunnel(payload.fens, payload.depth, payload.multiPv, payload.engine);
  }
  return analyzePositionForTunnel(payload.fen, payload.depth, payload.multiPv, payload.engine, payload.movetimeMs);
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

function pvUciToSan(fen: string, pvUci: string[]): string[] {
  const chess = new Chess(fen);
  const sanMoves: string[] = [];
  for (const uciMove of pvUci) {
    const move = chess.move({ from: uciMove.slice(0, 2), to: uciMove.slice(2, 4), promotion: uciMove.slice(4, 5) || undefined });
    if (!move) break;
    sanMoves.push(move.san);
  }
  return sanMoves;
}

// RawEngineLine.cp/mateIn are relative to whichever side is to move in `fen`
// (raw UCI semantics -- see shared-engine-worker.ts and eval-words.ts's own
// sideToMove conversion). Every other EngineEval/PositionAnalysis in the
// system is white-perspective (services/engine/src/uci.ts's recordInfoLine
// does this same conversion for the native backend), so this has to happen
// before a browser-tunnel result is packaged up -- otherwise every
// black-to-move position's cp sign is inverted relative to what
// classify.ts's cpLoss math expects.
function toWhitePerspective(fen: string, value: number | null): number | null {
  if (value === null) return null;
  const sideToMove = fen.split(' ')[1];
  return sideToMove === 'b' ? -value : value;
}

function toPositionAnalysisLine(fen: string, line: RawEngineLine) {
  const pvSan = pvUciToSan(fen, line.pvUci);
  return {
    moveUci: line.moveUci,
    moveSan: pvSan[0] ?? line.moveUci,
    pvSan,
    cp: toWhitePerspective(fen, line.cp),
    mateIn: toWhitePerspective(fen, line.mateIn)
  };
}

async function analyzePositionForTunnel(
  fen: string,
  depth: number,
  multiPv: number,
  engine: EngineTunnelPayload['engine'],
  movetimeMs: number | undefined
) {
  const lines = await workerForEngine(engine).analyze({ fen, depth, multiPv, movetimeMs });
  const positionLines = lines.map((line) => toPositionAnalysisLine(fen, line));
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

async function analyzeGameForTunnel(fens: string[], depth: number, multiPv: number, engine: EngineTunnelPayload['engine']) {
  const worker = workerForEngine(engine);
  const results = [];
  for (const [ply, fen] of fens.entries()) {
    const lines = await worker.analyze({ fen, depth, multiPv });
    results.push({
      ply,
      fen,
      depth,
      lines: lines.map((line) => {
        const [moveSan] = pvUciToSan(fen, [line.moveUci]);
        return {
          moveUci: line.moveUci,
          moveSan: moveSan ?? line.moveUci,
          cp: toWhitePerspective(fen, line.cp),
          mateIn: toWhitePerspective(fen, line.mateIn)
        };
      })
    });
  }
  return results;
}

/** Performs the actual outbound call from this tab, so it lands on the
 * third party from this user's own IP rather than the server's. Response
 * body is handed back as text, untouched — apps/api's own ChessApiEngineBackend
 * does the JSON parsing/validation it already does for a direct server
 * fetch, so nothing about that logic needs to know its fetch was tunneled. */
async function fetchForTunnel(url: string, method: string, body: string | undefined) {
  const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body });
  return { status: response.status, body: await response.text() };
}

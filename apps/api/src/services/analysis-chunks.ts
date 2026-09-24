import { positionKey, repairEvalSignConvention } from '@freechesscoach/chess-analysis';
import type { EngineEval } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import type { Database } from '../db/schema.js';
import type { AnalysisJobDependencies } from './analysis-deps.js';

/** Positions per engine call. Small enough that the progress percentage moves
 * often, large enough not to pay per-request overhead on every ply — and it
 * keeps each browser-mode tunnel request comfortably inside its timeout. */
const ENGINE_CHUNK_POSITIONS = 6;

interface PendingPosition {
  /** The fen sent to the engine: the first pending occurrence's. */
  fen: string;
  /** Every pending index holding this position (Task 77.2): a repetition is
   * sent once and its eval fanned back out to each index. */
  occurrences: { index: number; fen: string }[];
}

/**
 * Analyzes the game a chunk at a time, persisting what's done after each one.
 *
 * Two reasons to go chunk by chunk:
 * - Progress. `engine_running` is by far the longest step, and writing
 *   `evalsComputed` per chunk is what drives the percentage on the progress
 *   screen (GET /api/analyses/:id/status).
 * - Reuse (Task 77.1). The evals gathered so far are stored after every
 *   chunk. On entry, a stored eval is reused when its `ply` (the position's
 *   index in the game) and its `fen` both match; only the rest go to the
 *   engine, still in chunks of `ENGINE_CHUNK_POSITIONS`. A resume after a
 *   failure picks up where it stopped, and re-analysing a finished game makes
 *   no engine call at all.
 * - Deduplication (Task 77.2). Pending positions that repeat within the game
 *   (same `positionKey`: placement, side to move, castling, en passant) are
 *   sent once; each index gets the result with its own `ply` and `fen`.
 *
 * Deliberately at this layer rather than in either EngineBackend, so native
 * and browser mode report progress the same way.
 */
export async function analyzeInChunks(
  db: Kysely<Database>,
  deps: AnalysisJobDependencies,
  analysisId: string,
  fens: string[]
): Promise<EngineEval[]> {
  const known = reusableEvals(await analysesRepo.findEngineEvals(db, analysisId), fens);
  // Only when something was reused: a fresh run leaves the stored count
  // alone until its first chunk lands (a paused run keeps its progress).
  if (known.size > 0) await analysesRepo.setEvalsComputed(db, analysisId, known.size);

  for (const chunk of chunked(pendingPositions(known, fens), ENGINE_CHUNK_POSITIONS)) {
    const chunkEvals = await deps.analyzeGamePositions(chunk.map((position) => position.fen));
    chunk.forEach((position, i) => {
      const evalResult = chunkEvals[i];
      if (!evalResult) throw new Error(`Engine returned no eval for position ${position.fen}`);
      for (const { index, fen } of position.occurrences) known.set(index, renumbered(evalResult, index, fen));
    });
    const gathered = inIndexOrder(known);
    await analysesRepo.storeEngineEvals(db, analysisId, gathered);
    await analysesRepo.setEvalsComputed(db, analysisId, gathered.length);
  }

  return inIndexOrder(known);
}

/** Stored evals whose index still holds the same position, keyed by index. */
function reusableEvals(stored: EngineEval[], fens: string[]): Map<number, EngineEval> {
  const reusable = new Map<number, EngineEval>();
  for (const evalResult of stored) {
    if (fens[evalResult.ply] === evalResult.fen) reusable.set(evalResult.ply, evalResult);
  }
  return reusable;
}

/** Positions still missing an eval, one entry per distinct `positionKey`, in
 * order of first occurrence. */
function pendingPositions(known: ReadonlyMap<number, EngineEval>, fens: string[]): PendingPosition[] {
  const byKey = new Map<string, PendingPosition>();
  fens.forEach((fen, index) => {
    if (known.has(index)) return;
    const key = positionKey(fen);
    const existing = byKey.get(key);
    if (existing) existing.occurrences.push({ index, fen });
    else byKey.set(key, { fen, occurrences: [{ index, fen }] });
  });
  return [...byKey.values()];
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

/**
 * The backend only ever sees one chunk, so each EngineEval's `ply` comes back
 * chunk-relative (0..chunk.length-1); it becomes the position's real index in
 * the game here, and `fen` the full fen at that index (a repeated position's
 * move counters differ from the one that was sent). repairEvalSignConvention swaps a near-tied first/second line
 * back into best-first order instead of the whole job dying over engine
 * search noise (a real Stockfish multiPv quirk under time pressure, not
 * corrupt data — see its doc comment).
 */
function renumbered(evalResult: EngineEval, index: number, fen: string): EngineEval {
  return { ...evalResult, ply: index, fen, lines: repairEvalSignConvention(fen, evalResult.lines) };
}

function inIndexOrder(known: ReadonlyMap<number, EngineEval>): EngineEval[] {
  return [...known.entries()].sort(([a], [b]) => a - b).map(([, evalResult]) => evalResult);
}

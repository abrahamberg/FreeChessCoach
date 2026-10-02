import { ENGINE_MULTI_PV } from '@freechesscoach/shared';
import type { EngineBackend } from '../../src/services/engine/engine-backend.js';
import { lineViews } from './items.js';
import { isCheckmate } from './oracle.js';
import type { AuditItem, AuditPosition, LineView } from './types.js';

/** The audit's own search of a board with a mate on it, far deeper than the
 * app's (12, 18 deployed), through the audit's own engine call and cached
 * like every other answer. Measurement only: it never feeds the app. The
 * engine stops a search at its own time limit (five seconds on the dev
 * stack), so on a board where only some lines mate the depth is not
 * reached. */
export const MATE_PROBE_DEPTH = 40;

/** Boards per engine request: each may run to the engine's time limit, and
 * a game with fifty mates in one request outlasts the HTTP client (300 s). */
const PROBE_BATCH = 6;

const SAYS_MATE_COUNT = /\bmate in \d+\b/;

/** Adds `mateProbe` to every position that has a mate among its engine
 * lines, or a sentence with a mate count: the board before the move and the
 * board after it, searched again for `mate-count-exact`. */
export async function withMateProbes(positions: AuditPosition[], items: readonly AuditItem[], engine: Pick<EngineBackend, 'analyzeGame'>): Promise<AuditPosition[]> {
  const counted = new Set(items.filter((item) => SAYS_MATE_COUNT.test(item.text)).map((item) => item.positionKey));
  const probed = positions.filter((position) => counted.has(position.key) || hasMate(position.linesBefore) || hasMate(position.linesAfter));
  const fens = [...new Set(probed.flatMap((position) => [position.fenBefore, position.fenAfter]))].filter((fen) => !isCheckmate(fen));
  if (!fens.length) return positions;
  const byFen = new Map<string, LineView[]>();
  for (let start = 0; start < fens.length; start += PROBE_BATCH) {
    const batch = fens.slice(start, start + PROBE_BATCH);
    const evals = await engine.analyzeGame(batch, { depth: MATE_PROBE_DEPTH, multiPv: ENGINE_MULTI_PV });
    batch.forEach((fen, index) => byFen.set(fen, lineViews(evals[index])));
  }
  const keys = new Set(probed.map((position) => position.key));
  return positions.map((position) => (keys.has(position.key) ? { ...position, mateProbe: { before: byFen.get(position.fenBefore) ?? [], after: byFen.get(position.fenAfter) ?? [] } } : position));
}

function hasMate(lines: readonly LineView[]): boolean {
  return lines.some((line) => line.mate !== null);
}

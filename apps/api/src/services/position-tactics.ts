import {
  fenActiveColor,
  flipActiveColorFen,
  scanAvailableMotifs,
  scanTacticsForLines,
  type PvMotifSighting,
  type TacticSighting
} from '@freechesscoach/chess-analysis';
import type { EngineLine, PositionAnalysis } from '@freechesscoach/shared';
import type { EngineBackend } from './engine/engine-backend.js';

type PositionAnalyzer = Pick<EngineBackend, 'analyzePosition'>;

export interface PositionTacticsScan {
  /** The side to move's own tactics among their engine top-N lines — no
   * extra engine call, built from `primaryAnalysis` the caller already has. */
  available: TacticSighting[];
  /** The tactics the OPPONENT would get if the side to move does nothing —
   * via one extra engine call at the null-move (flipped active-color) FEN.
   * `null` when the position has the side to move in check, where "what if
   * you passed" isn't a sound question (see `flipActiveColorFen`). */
  allowed: TacticSighting[] | null;
}

export interface ScanPositionTacticsOptions {
  topN?: number;
  /** `'shallow'` (default): today's ply-1-only `scanTacticsForLines`,
   * byte-for-byte unchanged — every existing caller keeps this behavior
   * unless it opts in. `'graduated'`: the Phase 45 multi-ply schedule via
   * `scanAvailableMotifs`, catching a tactic that only appears a few plies
   * deep (e.g. a rook sac → fork combo) that the shallow scan can't see. */
  mode?: 'shallow' | 'graduated';
}

/**
 * Available + allowed (threat) tactics for a position, both classified
 * through the same registry (Phase 32) every other caller uses. Deliberately
 * NOT called from the batch game-report pipeline (build-game-report.ts) —
 * doing so would double the engine calls spent on every analyzed ply of
 * every game for a signal the /stats dashboard has no slot for yet; this is
 * for the live coach's single-position tools only.
 */
export async function scanPositionTactics(
  engine: PositionAnalyzer,
  fen: string,
  primaryAnalysis: PositionAnalysis,
  options: ScanPositionTacticsOptions = {}
): Promise<PositionTacticsScan> {
  const mover = fenActiveColor(fen);
  const available = scanTactics(options.mode, fen, primaryAnalysis.lines as EngineLine[], mover, options.topN);

  const flipped = flipActiveColorFen(fen);
  if (!flipped) return { available, allowed: null };

  const threatAnalysis = await engine.analyzePosition(flipped);
  const opponent = mover === 'white' ? 'black' : 'white';
  return { available, allowed: scanTactics(options.mode, flipped, threatAnalysis.lines as EngineLine[], opponent, options.topN) };
}

function scanTactics(
  mode: ScanPositionTacticsOptions['mode'],
  fen: string,
  lines: readonly EngineLine[],
  mover: 'white' | 'black',
  topN: number | undefined
): TacticSighting[] {
  if (mode !== 'graduated') return scanTacticsForLines(fen, lines, mover, topN);
  return scanAvailableMotifs(fen, lines, topN).sightings.map(toTacticSighting);
}

function toTacticSighting({ rank, moveSan, motif }: PvMotifSighting): TacticSighting {
  return { rank, moveSan, motif };
}

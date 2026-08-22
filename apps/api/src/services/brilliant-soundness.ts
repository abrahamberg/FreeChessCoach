import { toCpWhite, winPctFor, type PlayerColor } from '@chess-coach/chess-analysis';
import type { PositionAnalysis } from '@chess-coach/shared';
import type { EngineBackend } from './engine/engine-backend.js';

type PositionAnalyzer = Pick<EngineBackend, 'analyzePosition'>;

/**
 * Applies §5.5 B6 to an already-qualified Brilliant candidate. The position
 * is the one after the candidate's move, so the engine's first line is the
 * opponent's best reply. Calling the same backend without overrides keeps the
 * reply search at the backend's normal analysis depth, matching the batch
 * analysis depth used to produce the candidate.
 */
export async function checkBrilliantSoundness(
  engine: PositionAnalyzer,
  fenAfterMove: string,
  mover: PlayerColor,
  beforeWin: number
): Promise<boolean> {
  const replyAnalysis = await engine.analyzePosition(fenAfterMove);
  const bestReply = firstReply(replyAnalysis);
  if (!bestReply) return false;

  const winAfterBestReply = winPctFor(mover, toCpWhite(bestReply));
  return winAfterBestReply >= beforeWin - 3;
}

function firstReply(analysis: PositionAnalysis): PositionAnalysis['lines'][number] | undefined {
  return analysis.lines[0];
}

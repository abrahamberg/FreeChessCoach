import type { AttackedPieceDto, ForkSchema, PositionAnalysis, PositionFeatures } from '@chess-coach/shared';
import type { z } from 'zod';
import { formatEval } from './format-eval.js';

type Fork = z.infer<typeof ForkSchema>;

/**
 * Curated digest for the get_engine_analysis tool (AGENTS.md golden rule 8:
 * raw engine JSON must be digested before it reaches the coach's context —
 * the same discipline play mode's get_candidate_moves already applies via a
 * light-tier model call). No LLM round-trip needed here: the shape is fixed
 * and small enough to render deterministically, the same way
 * episode-context.ts's renderAnalysisSection curates the "Current position"
 * block instead of dumping PositionAnalysis/PositionFeatures raw.
 */
export function renderEngineAnalysisSummary(analysis: PositionAnalysis): string {
  const { bestMove, lines, features } = analysis;
  const bestLine = lines.find((line) => line.moveSan === bestMove);
  const parts: string[] = [bestMoveLine(bestMove, bestLine, features)];

  const otherLines = bestLine ? lines.filter((line) => line !== bestLine) : lines;
  if (otherLines.length > 0) {
    const otherText = otherLines
      .map((line) => `- ${line.moveSan} (${formatEval(line.cp, line.mateIn)}): ${line.pvSan.join(' ')}`)
      .join('\n');
    parts.push(`Other options:\n${otherText}`);
  }

  const featureBullets = renderNotableFeatureBullets(features);
  if (featureBullets) parts.push(`Notable features:\n${featureBullets}`);

  return parts.join('\n\n');
}

function bestMoveLine(
  bestMove: string | null,
  bestLine: PositionAnalysis['lines'][number] | undefined,
  features: PositionFeatures
): string {
  if (bestMove && bestLine) {
    return `Best move: ${bestMove} (${formatEval(bestLine.cp, bestLine.mateIn)})\nLine: ${bestLine.pvSan.join(' ')}`;
  }
  if (features.boardState === 'checkmate') return 'Checkmate — no moves.';
  if (features.boardState === 'stalemate') return 'Stalemate — no moves.';
  return 'No best move available.';
}

function renderNotableFeatureBullets(features: PositionFeatures): string {
  const bullets: string[] = [
    ...features.hangingPieces.map(hangingPieceBullet),
    ...features.forks.map(forkBullet),
    ...features.captureOpportunities.filter((capture) => capture.favorable).map(captureBullet)
  ];
  return bullets.join('\n');
}

function hangingPieceBullet(piece: AttackedPieceDto): string {
  return `- ${piece.color} ${piece.piece} on ${piece.square} is hanging`;
}

function forkBullet(fork: Fork): string {
  return `- ${fork.piece} on ${fork.square} forks ${fork.forkedSquares.join('/')}`;
}

function captureBullet(capture: PositionFeatures['captureOpportunities'][number]): string {
  return `- ${capture.moveSan} wins material (captures the ${capture.capturedPiece} on ${capture.to})`;
}

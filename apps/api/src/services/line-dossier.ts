import { applySanSequence, classifyLiveMove, coachReviewTexts, currentMoveFacts } from '@freechesscoach/chess-analysis';
import type { LineDossierRequest } from '@freechesscoach/shared';
import { renderMoveDossier } from '@freechesscoach/prompts';
import { ValidationError } from '../lib/errors.js';
import { computeFeatureDelta } from './coach-context.js';
import type { AnalyzePosition } from './engine/engine-backend.js';
import { toEngineEval } from './play-move-quality.js';

/** The dossier on each move of a line the student explores off the game: the
 * text the coach reads for a move of the game itself (engine lines, the
 * review's sentences, what the move did and the better one would have), made
 * with the same engine pipeline and renderer. The client sends it with the
 * student's message, so it is frozen in the transcript like any other turn. */
export async function buildLineDossier(analyzePosition: AnalyzePosition, request: LineDossierRequest): Promise<string> {
  const applied = applySanSequence(request.startFen, request.moves);
  if (applied.error) throw new ValidationError(applied.error);
  const sections: string[] = [];
  let fenBefore = request.startFen;
  for (const [index, move] of applied.moves.entries()) {
    const ply = request.basePly + index + 1;
    sections.push(await moveSection(analyzePosition, { ply, fenBefore, fenAfter: move.fen, san: move.san, studentColor: request.studentColor }));
    fenBefore = move.fen;
  }
  return sections.join('\n\n');
}

interface MoveInput {
  ply: number;
  fenBefore: string;
  fenAfter: string;
  san: string;
  studentColor: 'white' | 'black';
}

async function moveSection(analyzePosition: AnalyzePosition, { ply, fenBefore, fenAfter, san, studentColor }: MoveInput): Promise<string> {
  const [analysis, postMoveAnalysis] = await Promise.all([analyzePosition(fenBefore), analyzePosition(fenAfter, { multiPv: 1 })]);
  const classified = classifyLiveMove({
    ply,
    moveSan: san,
    mover: fenBefore.split(' ')[1] === 'b' ? 'black' : 'white',
    fenBefore,
    fenAfter,
    evalBefore: toEngineEval(fenBefore, analysis),
    evalAfter: toEngineEval(fenAfter, postMoveAnalysis),
    userColor: studentColor
  });
  const bestLine = analysis.lines.find((line) => line.moveSan === analysis.bestMove);
  const isBest = analysis.bestMove === san;
  const dossier = renderMoveDossier(ply, san, {
    analysis,
    classifiedMove: classified,
    review: coachReviewTexts(classified),
    postMoveAnalysis,
    featureDelta: isBest ? undefined : computeFeatureDelta(analysis, fenBefore, fenAfter),
    moveFacts: currentMoveFacts({
      fenBefore,
      playedSan: san,
      ...(analysis.bestMove && bestLine ? { best: { san: analysis.bestMove, line: bestLine.pvSan } } : {}),
      continuation: postMoveAnalysis.lines[0]?.pvSan ?? []
    })
  });
  return `${san} (${classified.quality}):\n${dossier}`;
}

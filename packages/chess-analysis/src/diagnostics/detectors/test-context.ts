import { Chess } from 'chess.js';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { applySanSequence } from '../../apply-san-sequence.js';
import { analyzeChecksCapturesThreats } from '../../checks-captures-threats.js';
import { buildPlyDiagnosticContext, type BuildPlyDiagnosticContextOptions, type PlyDiagnosticContext } from '../context.js';

/**
 * Test-only fixture builder for the detector tests: plays `moveSan` from a
 * real (legal) `fenBefore` so `fenAfter` can never disagree with the move,
 * then builds the context the registry would. `refutation` becomes the
 * next ply's `bestLinePvSan` — the engine's best reply to the move.
 */
export interface DetectorFixtureOptions extends BuildPlyDiagnosticContextOptions {
  refutation?: string[];
}

export function detectorContext(
  fenBefore: string,
  moveSan: string,
  overrides: Partial<ClassifiedMoveDto> = {},
  options: DetectorFixtureOptions = {}
): PlyDiagnosticContext {
  const chess = new Chess(fenBefore);
  const played = chess.move(moveSan);
  const move: ClassifiedMoveDto = {
    ply: 1,
    moveSan,
    mover: played.color === 'w' ? 'white' : 'black',
    isUserMove: true,
    cpLoss: 0,
    quality: 'best',
    bestLineSan: [],
    evalAfterCp: 0,
    hangsPiece: false,
    fenBefore,
    fenAfter: chess.fen(),
    checksCapturesThreats: analyzeChecksCapturesThreats(fenBefore),
    ...overrides
  };
  const { refutation, ...contextOptions } = options;
  const ctx = buildPlyDiagnosticContext(move, {
    ...contextOptions,
    nextMoves: contextOptions.nextMoves ?? refutationReply(move, refutation)
  });
  if (!ctx) throw new Error('fixture must build a context');
  return ctx;
}

/** A stand-in next ply whose only job is to carry the refutation line. */
function refutationReply(move: ClassifiedMoveDto, refutation: string[] | undefined): ClassifiedMoveDto[] | undefined {
  if (!refutation) return undefined;
  const replayed = applySanSequence(move.fenAfter ?? '', refutation);
  if (replayed.error) throw new Error(`fixture refutation is illegal: ${replayed.error}`);
  const mover = move.mover === 'white' ? 'black' : 'white';
  const fenBefore = move.fenAfter ?? '';
  return [
    {
      ...move,
      ply: move.ply + 1,
      mover,
      moveSan: refutation[0] ?? '',
      fenBefore,
      bestLinePvSan: refutation,
      // The reply's own pre-move scan, as `classify.ts` stores it — the
      // context reuses it as the opponent's scan of `fenAfter`.
      checksCapturesThreats: analyzeChecksCapturesThreats(fenBefore)
    }
  ];
}

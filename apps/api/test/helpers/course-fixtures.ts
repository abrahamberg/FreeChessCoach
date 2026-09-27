import { Chess } from 'chess.js';
import type { EngineEval } from '@freechesscoach/shared';
import { buildCourseDossierFromEngine, type CourseDossierBuilder } from '../../src/services/course-dossier.js';

/** docs/courses.md §6.6. */
export const ENGLUND = '1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2 6. Bc3 Bb4 7. Qd2 Bxc3 8. Qxc3 Qc1# *';
export const ENGLUND_INTAKE = {
  pgn: ENGLUND,
  kind: 'trap',
  direction: 'Englund Gambit trap for beginners. Make them feel it.',
  coachPersona: 'commander'
} as const;

/** A fake engine: level everywhere, except Black is winning from 6.Bc3 on. */
export const englundDossier: CourseDossierBuilder = (tree, learnerSide) => {
  const lost = new Set(tree.nodes.filter((node) => Number(node.id.slice(1)) >= 11).map((node) => node.fenAfter));
  const analyzeGame = (fens: string[]): Promise<EngineEval[]> =>
    Promise.resolve(
      fens.map((fen, ply) => ({
        ply,
        fen,
        depth: 20,
        lines: new Chess(fen)
          .moves({ verbose: true })
          .slice(0, 2)
          .map((move) => ({ moveSan: move.san, moveUci: `${move.from}${move.to}`, cp: lost.has(fen) ? -1000 : 0, mateIn: null }))
      }))
    );
  return buildCourseDossierFromEngine(tree, learnerSide, { analyzeGame });
};

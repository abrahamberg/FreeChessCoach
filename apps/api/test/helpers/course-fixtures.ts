import { Chess } from 'chess.js';
import type { EngineEval } from '@freechesscoach/shared';
import { buildCourseDossierFromEngine, type CourseDossierBuilder } from '../../src/services/courses/dossier.js';

/** docs/courses.md §6.6. */
export const ENGLUND = '1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2 6. Bc3 Bb4 7. Qd2 Bxc3 8. Qxc3 Qc1# *';
export const ENGLUND_INTAKE = {
  pgn: ENGLUND,
  kind: 'trap',
  direction: 'Englund Gambit trap for beginners. Make them feel it.',
  coachPersona: 'commander'
} as const;

const dossiers = new Map<string, Awaited<ReturnType<CourseDossierBuilder>>>();

/** A fake engine: level everywhere, except Black is winning from 6.Bc3 on.
 * Built once per tree, side and kind in a process (the analysis is most of a
 * test's time), and handed out as a copy. */
export const englundDossier: CourseDossierBuilder = async (tree, learnerSide, ownerId, kind) => {
  const key = `${kind}|${learnerSide}|${tree.nodes.map((node) => node.fenAfter).join('>')}`;
  const built = dossiers.get(key) ?? (await buildEnglundDossier(tree, learnerSide, ownerId, kind));
  dossiers.set(key, built);
  return structuredClone(built);
};

const buildEnglundDossier: CourseDossierBuilder = (tree, learnerSide, _ownerId, kind) => {
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
  return buildCourseDossierFromEngine(tree, learnerSide, { analyzeGame }, kind);
};

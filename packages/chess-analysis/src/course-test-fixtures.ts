import { Chess } from 'chess.js';
import type { EngineEval, EngineLine } from '@freechesscoach/shared';
import { classifyMoves } from './classify.js';
import { buildCourseDossier, type CourseDossier, type CourseLineAnalysis } from './course-dossier.js';
import { courseLineGames, courseTreeFens } from './course-line-game.js';
import type { CourseTree } from './course-tree.js';
import { findCandidateMoments } from './critical-moments.js';

/** docs/courses.md §6.6, nodes n1–n16; bait n11 = 6.Bc3, answer n12 = 6…Bb4. */
export const ENGLUND_TRAP = '1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2 6. Bc3 Bb4 7. Qd2 Bxc3 8. Qxc3 Qc1# *';

/** White-perspective score and ranked moves for one position; the first
 * move is the engine's best. */
export interface FakeEval {
  cp: number;
  moves: { san: string; cp: number }[];
}

/**
 * Fake engine evals for every tree position. By default each position's
 * best move is the tree's own next move at `baseCp(fen)`, and the second is
 * some other legal move 100cp worse for the mover. `overrides` replace
 * whole positions by FEN.
 */
export function fakeEvals(tree: CourseTree, baseCp: (fen: string) => number, overrides: ReadonlyMap<string, FakeEval> = new Map()): Map<string, EngineEval> {
  const nextSan = new Map<string, string>();
  for (const node of [...tree.nodes].reverse()) {
    const parent = tree.nodes.find((candidate) => candidate.id === node.parentId);
    nextSan.set(parent?.fenAfter ?? tree.startFen, node.san);
  }
  return new Map(
    courseTreeFens(tree).map((fen, ply) => {
      const override = overrides.get(fen);
      const lines = override ? override.moves.map((move) => engineLine(fen, move.san, move.cp)) : defaultLines(fen, nextSan.get(fen), baseCp(fen));
      return [fen, { ply, fen, depth: 20, lines }];
    })
  );
}

function defaultLines(fen: string, best: string | undefined, cp: number): EngineLine[] {
  const chess = new Chess(fen);
  const legal = chess.moves();
  const first = best ?? legal[0];
  if (!first) return [];
  const worse = chess.turn() === 'w' ? cp - 100 : cp + 100;
  const second = legal.find((san) => san !== first);
  return [engineLine(fen, first, cp), ...(second ? [engineLine(fen, second, worse)] : [])];
}

function engineLine(fen: string, san: string, cp: number): EngineLine {
  const move = new Chess(fen).move(san);
  return { moveSan: move.san, moveUci: `${move.from}${move.to}${move.promotion ?? ''}`, cp, mateIn: null };
}

/** What the API service does per line, without the engine or the report step. */
export function analyseCourse(tree: CourseTree, evalsByFen: ReadonlyMap<string, EngineEval>, learnerSide: 'white' | 'black'): {
  lines: CourseLineAnalysis[];
  dossier: CourseDossier;
} {
  const lines = courseLineGames(tree).map((line) => {
    const evals = line.game.positions.flatMap((position, ply) => {
      const evaluation = evalsByFen.get(position.fen);
      return evaluation ? [{ ...evaluation, ply }] : [];
    });
    const moves = classifyMoves(line.game, evals, learnerSide);
    return { line, moves, candidateMoments: findCandidateMoments(moves, evals) };
  });
  return { lines, dossier: buildCourseDossier({ tree, evalsByFen, lines, learnerSide }) };
}

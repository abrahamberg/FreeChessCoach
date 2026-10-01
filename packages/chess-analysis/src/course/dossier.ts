import type { EngineEval } from '@freechesscoach/shared';
import type { ClassifiedMove } from '../classify.js';
import { buildCourseLineFacts, type CourseLineFacts } from './dossier-line.js';
import { buildCourseNodeFacts, type CourseNodeFacts } from './dossier-node.js';
import type { CourseLineGame } from './line-game.js';
import type { CourseTree } from './tree.js';
import type { CandidateMoment } from '../critical-moments.js';

export type { CourseLineFacts } from './dossier-line.js';
export type { CourseNodeFacts } from './dossier-node.js';

/** One line after the whole-game analysis steps ran on it. `moves[i]` is
 * the move of `line.nodeIds[i]`. */
export interface CourseLineAnalysis {
  line: CourseLineGame;
  moves: ClassifiedMove[];
  candidateMoments: CandidateMoment[];
}

export interface CourseDossierInput {
  tree: CourseTree;
  /** One evaluation per distinct position (multiPv 3), White-perspective. */
  evalsByFen: ReadonlyMap<string, EngineEval>;
  lines: CourseLineAnalysis[];
  learnerSide: 'white' | 'black';
}

/** docs/courses.md §5.4: the checked facts the AI writes from. */
export interface CourseDossier {
  learnerSide: 'white' | 'black';
  nodes: CourseNodeFacts[];
  lines: CourseLineFacts[];
}

/** Facts per node, taken from the node's own line (`node.lineId`, the line
 * of its first leaf — every line through a node sees the same move). */
export function buildCourseDossier(input: CourseDossierInput): CourseDossier {
  const byLine = new Map(input.lines.map((analysis) => [analysis.line.lineId, analysis]));
  const nodes = input.tree.nodes.map((node) => {
    const analysis = byLine.get(node.lineId);
    const index = analysis?.line.nodeIds.indexOf(node.id) ?? -1;
    const move = index >= 0 ? analysis?.moves[index] : undefined;
    if (!analysis || !move) throw new Error(`No analysis for course node ${node.id} on line ${node.lineId}`);
    const fenBefore = index === 0 ? input.tree.startFen : (analysis.line.game.positions[index]?.fen ?? input.tree.startFen);
    return buildCourseNodeFacts({
      node,
      move,
      fenBefore,
      linePositionFens: analysis.line.game.positions.slice(0, index + 2).map((position) => position.fen),
      evalsByFen: input.evalsByFen,
      critical: analysis.candidateMoments.some((moment) => moment.ply === move.ply),
      learnerSide: input.learnerSide
    });
  });
  const lines = input.tree.lines.map((line) => {
    const analysis = byLine.get(line.id);
    if (!analysis) throw new Error(`No analysis for course line ${line.id}`);
    return buildCourseLineFacts(line, analysis.line, input.evalsByFen.get(analysis.line.game.positions.at(-1)?.fen ?? ''));
  });
  return { learnerSide: input.learnerSide, nodes, lines };
}

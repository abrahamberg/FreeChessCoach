import type { CourseKind, TacticMotifType } from '@freechesscoach/shared';
import type { CourseDossier, CourseNodeFacts } from './course-dossier.js';
import type { CourseLineGame } from './course-line-game.js';
import type { CourseTree } from './course-tree.js';

const ERROR_QUALITIES = new Set(['inaccuracy', 'mistake', 'blunder', 'miss']);
const BLUNDER_QUALITIES = new Set(['mistake', 'blunder']);
const SOUND_ANSWER_QUALITIES = new Set(['brilliant', 'great', 'best', 'excellent', 'book']);

export interface TrapSkeleton {
  kind: 'trap';
  lineId: string;
  baitNodeId: string;
  answerNodeId: string | null;
  punishNodeIds: string[];
  safeMoveSan: string | null;
  /** The trapper's own setup moves that are inaccurate or worse against best play. */
  trapperRiskNodeIds: string[];
}

export interface OpeningSkeleton {
  kind: 'opening_reel' | 'opening_course';
  lines: { lineId: string; bookExitNodeId: string | null; learnerNodeIds: string[] }[];
  /** First moves of sidelines: where the tree branches off the main continuation. */
  deviationNodeIds: string[];
  traps: { blunderNodeId: string; answerNodeId: string }[];
}

export interface TacticsSkeleton {
  kind: 'tactics';
  /** Easiest first: the shortest winning line. */
  /** `nodeId` is the move to find; `startNodeId` is where the example
   * starts: the learner's move before the opponent's mistake that allows it. */
  examples: { lineId: string; nodeId: string; startNodeId: string; motif: TacticMotifType | null; depth: number }[];
}

export interface MasterGameSkeleton {
  kind: 'master_game';
  criticalNodeIds: string[];
  quizNodeIds: string[];
  phaseBoundaryNodeIds: string[];
}

export type CourseSkeleton = TrapSkeleton | OpeningSkeleton | TacticsSkeleton | MasterGameSkeleton;

export interface CourseSkeletonInput {
  kind: CourseKind;
  tree: CourseTree;
  lines: CourseLineGame[];
  dossier: CourseDossier;
}

/** docs/courses.md §5.5: what code proposes before any AI call, and the
 * manual path's episodes (§10). Null when a trap line has no victim move. */
export function buildCourseSkeleton(input: CourseSkeletonInput): CourseSkeleton | null {
  const facts = new Map(input.dossier.nodes.map((node) => [node.nodeId, node]));
  const lineFacts = (line: CourseLineGame): CourseNodeFacts[] => line.nodeIds.flatMap((id) => facts.get(id) ?? []);
  if (input.kind === 'trap') {
    const line = input.lines[0];
    return line ? trapSkeleton(line.lineId, lineFacts(line), input.dossier.learnerSide) : null;
  }
  if (input.kind === 'tactics') return tacticsSkeleton(input.lines, lineFacts, input.dossier.learnerSide);
  if (input.kind === 'master_game') return masterGameSkeleton(input.dossier);
  return openingSkeleton(input, lineFacts);
}

function trapSkeleton(lineId: string, nodes: CourseNodeFacts[], learnerSide: 'white' | 'black'): TrapSkeleton | null {
  let baitIndex = -1;
  nodes.forEach((node, index) => {
    const best = nodes[baitIndex];
    if (node.side !== learnerSide && node.winDrop > 0 && (!best || node.winDrop > best.winDrop)) baitIndex = index;
  });
  const bait = nodes[baitIndex];
  if (!bait) return null;
  return {
    kind: 'trap',
    lineId,
    baitNodeId: bait.nodeId,
    answerNodeId: nodes[baitIndex + 1]?.nodeId ?? null,
    punishNodeIds: nodes.slice(baitIndex + 2).map((node) => node.nodeId),
    safeMoveSan: bait.bestInstead?.san ?? null,
    trapperRiskNodeIds: nodes.slice(0, baitIndex).filter((node) => node.side === learnerSide && ERROR_QUALITIES.has(node.quality)).map((node) => node.nodeId)
  };
}

function openingSkeleton(input: CourseSkeletonInput, lineFacts: (line: CourseLineGame) => CourseNodeFacts[]): OpeningSkeleton {
  const learnerSide = input.dossier.learnerSide;
  const exits = new Map(input.dossier.lines.map((line) => [line.lineId, line.bookExitNodeId]));
  const traps = new Map<string, string>();
  for (const line of input.lines) {
    const nodes = lineFacts(line);
    nodes.forEach((node, index) => {
      const answer = nodes[index + 1];
      if (BLUNDER_QUALITIES.has(node.quality) && answer && SOUND_ANSWER_QUALITIES.has(answer.quality)) traps.set(node.nodeId, answer.nodeId);
    });
  }
  return {
    kind: input.kind === 'opening_reel' ? 'opening_reel' : 'opening_course',
    lines: input.lines.map((line) => ({
      lineId: line.lineId,
      bookExitNodeId: exits.get(line.lineId) ?? null,
      learnerNodeIds: lineFacts(line).filter((node) => node.side === learnerSide).map((node) => node.nodeId)
    })),
    deviationNodeIds: deviations(input.tree),
    traps: [...traps].map(([blunderNodeId, answerNodeId]) => ({ blunderNodeId, answerNodeId }))
  };
}

/** Every child after the first: the first child is the main continuation. */
function deviations(tree: CourseTree): string[] {
  const seen = new Set<string>();
  return tree.nodes
    .filter((node) => {
      const parent = node.parentId ?? 'root';
      const isFirst = !seen.has(parent);
      seen.add(parent);
      return !isFirst;
    })
    .map((node) => node.id);
}

/** One example per line: the learner's first move that plays a motif,
 * else the first quiz-eligible one; depth = plies left to the line's end.
 * When the opponent's move just before it was a mistake, the example starts
 * one move earlier, so it shows the mistake (Legal's mate: 5.Nxe5 Bxd1??,
 * not just 6.Bxf7+). */
const MISTAKES = new Set(['mistake', 'blunder']);

function tacticsSkeleton(
  lines: CourseLineGame[],
  lineFacts: (line: CourseLineGame) => CourseNodeFacts[],
  learnerSide: 'white' | 'black'
): TacticsSkeleton {
  const examples = lines.flatMap((line) => {
    const nodes = lineFacts(line).filter((node) => node.side === learnerSide);
    const pick = nodes.find((node) => node.motif) ?? nodes.find((node) => node.quizEligible);
    if (!pick) return [];
    const at = line.nodeIds.indexOf(pick.nodeId);
    const allowedBy = lineFacts(line).find((node) => node.nodeId === line.nodeIds[at - 1]);
    const startNodeId = allowedBy && MISTAKES.has(allowedBy.quality) && at >= 2 ? line.nodeIds[at - 2]! : pick.nodeId;
    return [{ lineId: line.lineId, nodeId: pick.nodeId, startNodeId, motif: pick.motif, depth: line.nodeIds.length - at }];
  });
  return { kind: 'tactics', examples: examples.sort((a, b) => a.depth - b.depth) };
}

function masterGameSkeleton(dossier: CourseDossier): MasterGameSkeleton {
  const nodes = dossier.nodes;
  return {
    kind: 'master_game',
    criticalNodeIds: nodes.filter((node) => node.critical).map((node) => node.nodeId),
    quizNodeIds: nodes.filter((node) => node.side === dossier.learnerSide && node.quizEligible).map((node) => node.nodeId),
    phaseBoundaryNodeIds: nodes.filter((node, index) => index > 0 && node.phase !== null && node.phase !== nodes[index - 1]?.phase).map((node) => node.nodeId)
  };
}

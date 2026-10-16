import type { CourseKind, TacticMotifType } from '@freechesscoach/shared';
import type { CourseDossier, CourseNodeFacts } from './dossier.js';
import type { CourseLineGame } from './line-game.js';
import { ownMoves } from './own-moves.js';
import { deviations, endgameSkeleton, puzzleSkeleton } from './skeleton-endgame.js';
import type { CourseTree } from './tree.js';

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
  /** The victim's first error after the bait that the engine has a better
   * move for: a second way out, one move late (the Stafford's 7.Be3 for
   * 7.Bxd8). The safety episode runs on to it. */
  laterExitNodeId: string | null;
  /** The trapper's own setup moves that are inaccurate or worse against best play. */
  trapperRiskNodeIds: string[];
  /** The creator's other lines: how to defend, and what the trapper does then. */
  sidelines: TrapSideline[];
}

/** A line besides the trap's own. `by` is who plays its first own move: the
 * victim (a defence) or the trapper (another try); `atBait` when that move is
 * played instead of the bait. */
export interface TrapSideline {
  lineId: string;
  /** The moves no earlier line has. */
  nodeIds: string[];
  by: 'victim' | 'trapper';
  atBait: boolean;
}

export interface OpeningSkeleton {
  kind: 'opening';
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

/** A general lesson: the same examples as a tactics course, on any topic. */
export interface LessonSkeleton extends Omit<TacticsSkeleton, 'kind'> {
  kind: 'lesson';
}

export interface MasterGameSkeleton {
  kind: 'master_game';
  criticalNodeIds: string[];
  quizNodeIds: string[];
  phaseBoundaryNodeIds: string[];
}

/** docs/courses.md §13.2: a position and its solution. Every learner move
 * is asked; the opponent's are the defence. */
export interface PuzzleSkeleton {
  kind: 'puzzle';
  lineId: string;
  learnerNodeIds: string[];
  /** Learner moves to mate when the line ends in mate, else null. */
  mateIn: number | null;
  /** What the solution achieves, from the engine's words at the line's end:
   * a mate, a win, a draw (stalemate, perpetual check), or none of them (a
   * "perpetual" the defender escapes, still lost at the end). */
  goal: 'mate' | 'win' | 'draw' | 'none';
  /** Learner moves that are not the engine's one clear best: a second
   * solution the learner could play. Empty when the puzzle is sound. */
  unsoundNodeIds: string[];
  /** Learner moves the engine calls an error: the solution itself is wrong
   * there (a puzzle whose 1.Qa4+ walks into …Rxa4). */
  wrongNodeIds: string[];
}

/** Phase 103: a position and its technique. The goal is the learner's: to
 * win where the engine gives them a winning position at the start, else to
 * hold the draw. */
export interface EndgameSkeleton {
  kind: 'endgame';
  lineId: string;
  goal: 'win' | 'draw';
  /** The material at the start, in words ("White is a rook up"). */
  material: string;
  /** The learner's moves on the main line. */
  learnerNodeIds: string[];
  /** Learner moves that are the one move keeping the result: the quizzes. */
  onlyMoveNodeIds: string[];
  /** The defender's tries: the first move of each sideline. */
  deviationNodeIds: string[];
  /** Learner moves of the technique the engine calls an error. */
  wrongNodeIds: string[];
}

export type CourseSkeleton = TrapSkeleton | OpeningSkeleton | TacticsSkeleton | MasterGameSkeleton | PuzzleSkeleton | EndgameSkeleton | LessonSkeleton;

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
  if (input.kind === 'trap') return trapSkeleton(input, lineFacts);
  if (input.kind === 'tactics') return tacticsSkeleton(input.lines, lineFacts, input.dossier.learnerSide, false);
  if (input.kind === 'lesson') return { ...tacticsSkeleton(input.lines, lineFacts, input.dossier.learnerSide, true), kind: 'lesson' };
  if (input.kind === 'endgame') {
    const line = input.lines[0];
    return line ? endgameSkeleton(input, line.lineId, lineFacts(line)) : null;
  }
  if (input.kind === 'master_game') return masterGameSkeleton(input.dossier, input.lines[0]?.nodeIds ?? []);
  if (input.kind === 'puzzle') {
    const line = input.lines[0];
    return line ? puzzleSkeleton(line.lineId, lineFacts(line), input.dossier.learnerSide) : null;
  }
  return openingSkeleton(input, lineFacts);
}

/** The bait is the victim's one main-line move the creator marked `?` or `??`
 * (docs/plan.md M4); else the victim's move with the largest drop. */
function trapSkeleton(input: CourseSkeletonInput, lineFacts: (line: CourseLineGame) => CourseNodeFacts[]): TrapSkeleton | null {
  const main = input.lines[0];
  if (!main) return null;
  const learnerSide = input.dossier.learnerSide;
  const nodes = lineFacts(main);
  const baitIndex = markedBaitIndex(nodes, learnerSide) ?? largestDropIndex(nodes, learnerSide);
  const bait = nodes[baitIndex];
  if (!bait) return null;
  return {
    kind: 'trap',
    lineId: main.lineId,
    baitNodeId: bait.nodeId,
    answerNodeId: nodes[baitIndex + 1]?.nodeId ?? null,
    punishNodeIds: nodes.slice(baitIndex + 2).map((node) => node.nodeId),
    safeMoveSan: bait.bestInstead?.san ?? null,
    laterExitNodeId: nodes.slice(baitIndex + 2).find((node) => node.side !== learnerSide && ERROR_QUALITIES.has(node.quality) && node.bestInstead)?.nodeId ?? null,
    trapperRiskNodeIds: nodes.slice(0, baitIndex).filter((node) => node.side === learnerSide && ERROR_QUALITIES.has(node.quality)).map((node) => node.nodeId),
    sidelines: trapSidelines(input, bait.nodeId)
  };
}

function markedBaitIndex(nodes: CourseNodeFacts[], learnerSide: 'white' | 'black'): number | null {
  const marked = nodes.flatMap((node, index) => (node.side !== learnerSide && (node.creatorGlyph === '?' || node.creatorGlyph === '??') ? [index] : []));
  return marked.length === 1 ? (marked[0] ?? null) : null;
}

function largestDropIndex(nodes: CourseNodeFacts[], learnerSide: 'white' | 'black'): number {
  let baitIndex = -1;
  nodes.forEach((node, index) => {
    const best = nodes[baitIndex];
    if (node.side !== learnerSide && node.winDrop > 0 && (!best || node.winDrop > best.winDrop)) baitIndex = index;
  });
  return baitIndex;
}

function trapSidelines(input: CourseSkeletonInput, baitNodeId: string): TrapSideline[] {
  const facts = new Map(input.dossier.nodes.map((node) => [node.nodeId, node]));
  const parentOf = new Map(input.tree.nodes.map((node) => [node.id, node.parentId]));
  const own = ownMoves(input.lines);
  return input.lines.flatMap((line, index) => {
    const nodeIds = own[index] ?? [];
    const first = nodeIds[0];
    if (index === 0 || !first) return [];
    return [{ lineId: line.lineId, nodeIds, by: facts.get(first)?.side === input.dossier.learnerSide ? ('trapper' as const) : ('victim' as const), atBait: parentOf.get(first) === parentOf.get(baitNodeId) }];
  });
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
    kind: 'opening',
    lines: input.lines.map((line) => ({
      lineId: line.lineId,
      bookExitNodeId: exits.get(line.lineId) ?? null,
      learnerNodeIds: lineFacts(line).filter((node) => node.side === learnerSide).map((node) => node.nodeId)
    })),
    deviationNodeIds: deviations(input.tree),
    traps: [...traps].map(([blunderNodeId, answerNodeId]) => ({ blunderNodeId, answerNodeId }))
  };
}

/** One example per line: the learner's first move that plays a motif,
 * else the first quiz-eligible one; depth = plies left to the line's end.
 * When the opponent's move just before it was a mistake, the example starts
 * one move earlier, so it shows the mistake (Legal's mate: 5.Nxe5 Bxd1??,
 * not just 6.Bxf7+). */
const MISTAKES = new Set(['mistake', 'blunder']);

/** A lesson's example need not play a motif or be an only move (how a knight
 * moves, what stalemate looks like): `everyLine` keeps one example per line
 * anyway, on the learner's first move, else the line's first. */
function tacticsSkeleton(
  lines: CourseLineGame[],
  lineFacts: (line: CourseLineGame) => CourseNodeFacts[],
  learnerSide: 'white' | 'black',
  everyLine: boolean
): TacticsSkeleton {
  const examples = lines.flatMap((line) => {
    const nodes = lineFacts(line).filter((node) => node.side === learnerSide);
    const pick = nodes.find((node) => node.motif) ?? nodes.find((node) => node.quizEligible) ?? (everyLine ? (nodes[0] ?? lineFacts(line)[0]) : undefined);
    if (!pick) return [];
    const at = line.nodeIds.indexOf(pick.nodeId);
    const allowedBy = lineFacts(line).find((node) => node.nodeId === line.nodeIds[at - 1]);
    const startNodeId = allowedBy && MISTAKES.has(allowedBy.quality) && at >= 2 ? line.nodeIds[at - 2]! : pick.nodeId;
    return [{ lineId: line.lineId, nodeId: pick.nodeId, startNodeId, motif: pick.motif, depth: line.nodeIds.length - at }];
  });
  return { kind: 'tactics', examples: examples.sort((a, b) => a.depth - b.depth) };
}

/** The game's own moments: the creator's variations are not critical moments. */
function masterGameSkeleton(dossier: CourseDossier, mainLine: readonly string[]): MasterGameSkeleton {
  const onMain = new Set(mainLine);
  const nodes = dossier.nodes.filter((node) => onMain.has(node.nodeId));
  return {
    kind: 'master_game',
    criticalNodeIds: nodes.filter((node) => node.critical).map((node) => node.nodeId),
    quizNodeIds: nodes.filter((node) => node.side === dossier.learnerSide && node.quizEligible).map((node) => node.nodeId),
    phaseBoundaryNodeIds: nodes.filter((node, index) => index > 0 && node.phase !== null && node.phase !== nodes[index - 1]?.phase).map((node) => node.nodeId)
  };
}

import { materialWords } from '../board-facts/material.js';
import type { CourseNodeFacts } from './dossier.js';
import type { CourseSkeletonInput, EndgameSkeleton, PuzzleSkeleton } from './skeleton.js';
import type { CourseTree } from './tree.js';

/** A solution move that is wrong, not just slower: the Saavedra's 4.Kb3 is
 * an inaccuracy beside Kc3, and both win. */
const WRONG_QUALITIES = new Set(['mistake', 'blunder', 'miss']);

export function endgameSkeleton(input: CourseSkeletonInput, lineId: string, nodes: CourseNodeFacts[]): EndgameSkeleton {
  const side = input.dossier.learnerSide;
  const learner = nodes.filter((node) => node.side === side);
  return {
    kind: 'endgame',
    lineId,
    // The start or the line's end: the Saavedra's start reads only "White is
    // better" to the engine; its end, a rook up, is winning.
    goal: winsFor(nodes[0]?.before ?? '', side) || winsFor(nodes[nodes.length - 1]?.after ?? '', side) ? 'win' : 'draw',
    material: materialWords(input.tree.startFen),
    learnerNodeIds: learner.map((node) => node.nodeId),
    onlyMoveNodeIds: learner.filter((node) => node.quizEligible).map((node) => node.nodeId),
    deviationNodeIds: deviations(input.tree),
    wrongNodeIds: learner.filter((node) => WRONG_QUALITIES.has(node.quality)).map((node) => node.nodeId)
  };
}

/** The dossier's words for a position ("White is winning", "White has a
 * forced mate in 12") give `side` a win. Without a tablebase a won endgame
 * reads "much better": the king-and-pawn win and the Lucena were both taught
 * as "hold the draw". */
function winsFor(words: string, side: 'white' | 'black', edge = /much better|winning|mate/): boolean {
  const name = side === 'white' ? 'White' : 'Black';
  return words.startsWith(name) && edge.test(words);
}

/** A draw is a save: a stalemate, a repetition, or a level end from a start
 * the learner was losing. A knight fork that takes the rook from a level
 * start (knight against rook, then knight alone: both draws) saves nothing. */
function savesDraw(nodes: CourseNodeFacts[], end: string, side: 'white' | 'black'): boolean {
  if (end === 'stalemate' || nodes[nodes.length - 1]?.board.some((fact) => fact.kind === 'repetition')) return true;
  return /^The position is roughly equal/.test(end) && winsFor(nodes[0]?.before ?? '', side === 'white' ? 'black' : 'white', /better|winning|mate/);
}

export function puzzleSkeleton(lineId: string, nodes: CourseNodeFacts[], learnerSide: 'white' | 'black'): PuzzleSkeleton {
  const learner = nodes.filter((node) => node.side === learnerSide);
  const last = nodes[nodes.length - 1];
  const mateIn = last?.san.endsWith('#') && last.side === learnerSide ? learner.length : null;
  const end = last?.after ?? '';
  return {
    kind: 'puzzle',
    lineId,
    learnerNodeIds: learner.map((node) => node.nodeId),
    mateIn,
    goal: mateIn ? 'mate' : winsFor(end, learnerSide) ? 'win' : savesDraw(nodes, end, learnerSide) ? 'draw' : 'none',
    // A mating move is sound even when another move mates too.
    unsoundNodeIds: learner.filter((node) => !node.quizEligible && !node.san.endsWith('#') && !WRONG_QUALITIES.has(node.quality)).map((node) => node.nodeId),
    wrongNodeIds: learner.filter((node) => WRONG_QUALITIES.has(node.quality)).map((node) => node.nodeId)
  };
}

/** Every child after the first: the first child is the main continuation. */
export function deviations(tree: CourseTree): string[] {
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

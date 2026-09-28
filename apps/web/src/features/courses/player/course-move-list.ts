import type { ClassifiedMoveDto, CourseDocument, CourseNode, PublicCourseResponse } from '@freechesscoach/shared';
import { moveListStart, type MoveListStart } from '../../board/moveListStart.js';
import { moveSounds, type MoveSounds } from '../../../sounds/move-sounds.js';

export type CourseEvals = PublicCourseResponse['evals'];

/** A course line in the shape the app's board widgets read (MoveExplorer,
 * MoveNavStrip, EvalBar, GameEvalChart): plies from the course's start. */
export interface CourseMoveList {
  start: MoveListStart;
  sanMoves: string[];
  /** Ply 0 is the course's start position. */
  positions: { ply: number; fen: string }[];
  /** Only moves the engine pass rated; empty when the course has none. */
  classifiedMoves: ClassifiedMoveDto[];
}

/** The line from the course's start through `moves`: the moves before the
 * first of them (an episode's lead-in) come first, found through the tree. */
export function courseMoveList(document: CourseDocument, moves: readonly CourseNode[], evals: CourseEvals): CourseMoveList & { leadIn: number } {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const leadIn: CourseNode[] = [];
  for (let parentId = moves[0]?.parentId ?? null; parentId; ) {
    const parent = byId.get(parentId);
    if (!parent) break;
    leadIn.unshift(parent);
    parentId = parent.parentId;
  }
  return { ...moveListOf(document, [...leadIn, ...moves], evals), leadIn: leadIn.length };
}

/** Moves played from the course's start, in order (a drill's played moves). */
export function moveListOf(document: CourseDocument, line: readonly CourseNode[], evals: CourseEvals): CourseMoveList {
  const start = moveListStart(document.startFen);
  const learner = document.learnerSide;
  const classifiedMoves = line.flatMap((node, index): ClassifiedMoveDto[] => {
    const rated = evals[node.id];
    if (!rated) return [];
    const mover = (index + (start.blackFirst ? 1 : 0)) % 2 === 0 ? 'white' : 'black';
    // The widgets read the ply, the evaluation and the quality; the rest is
    // the game review's and stays empty (no loss figure, no tactics).
    return [{ ply: index + 1, moveSan: node.san, mover, isUserMove: mover === learner, cpLoss: 0, quality: rated.quality, bestLineSan: [], evalAfterCp: rated.cp, hangsPiece: false }];
  });
  return {
    start,
    sanMoves: line.map((node) => node.san),
    positions: [{ ply: 0, fen: document.startFen }, ...line.map((node, index) => ({ ply: index + 1, fen: node.fenAfter }))],
    classifiedMoves
  };
}

/** A course move's board sounds (docs/plan.md Phase 88): an analyzed move,
 * so bad and great follow either side's move, from the course's
 * evaluations. `stinger` overrides it (a solved quiz is great). */
export function courseMoveSounds(document: CourseDocument, evals: CourseEvals, node: CourseNode, stinger?: MoveSounds['stinger']): MoveSounds {
  const rated = evals[node.id];
  const sounds = moveSounds({
    san: node.san,
    // The side to move after the move is the other side.
    mover: node.fenAfter.split(' ')[1] === 'w' ? 'black' : 'white',
    learnerSide: document.learnerSide,
    quality: rated?.quality,
    cpBefore: node.parentId ? evals[node.parentId]?.cp : 0,
    cpAfter: rated?.cp
  });
  return stinger === undefined ? sounds : { ...sounds, stinger };
}

import { Chess, type Square } from 'chess.js';
import type { CourseArrow, CourseEpisode } from '@freechesscoach/shared';
import { CONFIG } from './config.js';
import type { CourseVerifyProblem } from './course-verify.js';
import type { EpisodeScope } from './course-verify-scope.js';
import { flipActiveColorFen } from './null-move-fen.js';

/** Every node the episode names lies inside it, and beats run in move order. */
export function nodeProblems(episode: CourseEpisode, scope: EpisodeScope): CourseVerifyProblem[] {
  const problems: CourseVerifyProblem[] = [];
  const outside = (nodeId: string, where: string): void => {
    if (!scope.inside.has(nodeId)) problems.push({ code: 'nodes', nodeId, message: `${where} is on ${nodeId}, which is not in this episode` });
  };
  const order = new Map([...scope.inside].map((nodeId) => [nodeId, scope.path.indexOf(nodeId) < 0 ? scope.path.length : scope.path.indexOf(nodeId)]));

  let last = -1;
  episode.beats.forEach((beat, index) => {
    if (beat.nodeId === null) return;
    outside(beat.nodeId, `Beat ${index + 1}`);
    const at = order.get(beat.nodeId);
    if (at === undefined) return;
    if (at < last) problems.push({ code: 'nodes', nodeId: beat.nodeId, message: `Beat ${index + 1} goes back to an earlier move` });
    last = Math.max(last, at);
  });
  for (const note of episode.notes) outside(note.nodeId, 'A note');
  for (const nodeId of episode.drillNodeIds) outside(nodeId, 'A drill');
  return problems;
}

/** Each arrow is a move for either side in the position before or after its
 * node; a highlighted square (from === to) always passes. */
export function arrowProblems(episode: CourseEpisode, scope: EpisodeScope): CourseVerifyProblem[] {
  const problems: CourseVerifyProblem[] = [];
  const check = (arrows: CourseArrow[], nodeId: string | null, where: string): void => {
    const fens = nodeId ? [scope.fenBefore(nodeId), scope.byId.get(nodeId)?.fenAfter] : [scope.fenBefore(scope.path[0] ?? '')];
    for (const arrow of arrows) {
      if (arrow.from === arrow.to || fens.some((fen) => fen && isMoveEitherSide(fen, arrow))) continue;
      problems.push({ code: 'arrows', nodeId, message: `The arrow ${arrow.from}-${arrow.to} in ${where} is not a move for either side` });
    }
  };

  episode.beats.forEach((beat, index) => {
    if (beat.arrows.length > CONFIG.courses.maxArrowsPerBeat) {
      problems.push({ code: 'arrows', nodeId: beat.nodeId, message: `Beat ${index + 1} has ${beat.arrows.length} arrows (at most ${CONFIG.courses.maxArrowsPerBeat})` });
    }
    check(beat.arrows, beat.nodeId, `beat ${index + 1}`);
  });
  for (const note of episode.notes) check(note.arrows, note.nodeId, `the note on ${note.nodeId}`);
  return problems;
}

function isMoveEitherSide(fen: string, arrow: CourseArrow): boolean {
  const legal = [fen, flipActiveColorFen(fen)].some(
    (position) => position !== null && new Chess(position).moves({ verbose: true }).some((move) => move.from === arrow.from && move.to === arrow.to)
  );
  return legal || attacksAlong(fen, arrow);
}

/** The piece on `from` attacks `to`. After a check the side that gave it
 * can't be put to move (the flipped position is illegal), yet "Qb4+ also
 * hits b2" is still a fair arrow. */
function attacksAlong(fen: string, arrow: CourseArrow): boolean {
  const chess = new Chess(fen);
  const piece = chess.get(arrow.from as Square);
  return piece !== undefined && chess.attackers(arrow.to as Square, piece.color).includes(arrow.from as Square);
}

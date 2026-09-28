import { Chess, type Square } from 'chess.js';
import type { CourseArrow, CourseEpisode } from '@freechesscoach/shared';
import { CONFIG } from './config.js';
import type { CourseVerifyProblem } from './course-verify.js';
import type { EpisodeScope } from './course-verify-scope.js';
import { flipActiveColorFen } from './null-move-fen.js';

/** Every node the episode names lies inside it, and its moves run in move
 * order, each once. */
export function nodeProblems(episode: CourseEpisode, scope: EpisodeScope): CourseVerifyProblem[] {
  const problems: CourseVerifyProblem[] = [];
  const outside = (nodeId: string, where: string): void => {
    if (!scope.inside.has(nodeId)) problems.push({ code: 'nodes', nodeId, message: `${where} is on ${nodeId}, which is not in this episode` });
  };
  const order = new Map([...scope.inside].map((nodeId) => [nodeId, scope.path.indexOf(nodeId) < 0 ? scope.path.length : scope.path.indexOf(nodeId)]));

  let last = -1;
  const seen = new Set<string>();
  for (const ply of episode.plies) {
    outside(ply.nodeId, `The line on ${ply.nodeId}`);
    if (seen.has(ply.nodeId)) problems.push({ code: 'nodes', nodeId: ply.nodeId, message: `${ply.nodeId} has two lines; keep one` });
    seen.add(ply.nodeId);
    const at = order.get(ply.nodeId);
    if (at === undefined) continue;
    if (at < last) problems.push({ code: 'nodes', nodeId: ply.nodeId, message: `The line on ${ply.nodeId} goes back to an earlier move` });
    last = Math.max(last, at);
  }
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

  for (const ply of episode.plies) {
    if (ply.arrows.length > CONFIG.courses.maxArrowsPerBeat) {
      problems.push({ code: 'arrows', nodeId: ply.nodeId, message: `The move ${ply.nodeId} has ${ply.arrows.length} arrows (at most ${CONFIG.courses.maxArrowsPerBeat})` });
    }
    check(ply.arrows, ply.nodeId, `the line on ${ply.nodeId}`);
  }
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

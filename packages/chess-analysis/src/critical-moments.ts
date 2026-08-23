import type { EngineEval } from '@freechesscoach/shared';
import type { ClassifiedMove } from './classify.js';
import { whitePerspectiveCp } from './classify.js';
import { winPctWhite } from './win-probability.js';

/** Win% (White-perspective) band edge for a "turning point" — chosen to sit
 * close to where the old raw ±150cp threshold landed near a balanced
 * position (winPctWhite(150) ≈ 63), but unlike a flat cp threshold this
 * scales correctly across the whole eval range: the same cp swing is a real
 * turning point near 0 and noise once a position is already decided. */
const TURNING_POINT_WINPCT_THRESHOLD = 65;

export type CandidateMomentKind = 'user_mistake' | 'turning_point' | 'instructive';

export interface CandidateMoment {
  ply: number;
  kind: CandidateMomentKind;
  cpLoss: number;
}

const KIND_PRIORITY: Record<CandidateMomentKind, number> = {
  user_mistake: 3,
  instructive: 2,
  turning_point: 1
};

const USER_MISTAKE_QUALITIES: ReadonlySet<ClassifiedMove['quality']> = new Set([
  'mistake',
  'blunder',
  'miss',
  'inaccuracy'
]);
const INSTRUCTIVE_QUALITIES: ReadonlySet<ClassifiedMove['quality']> = new Set(['brilliant', 'great']);

/**
 * Finds candidate critical-moment plies for the analysis-planner LLM to
 * prioritize: user mistakes/inaccuracies, turning points (win% swings), and
 * instructive non-mistake moments (brilliant/great) that give the planner's
 * rule (d) — "one instructive non-mistake moment" — real signal to pick from
 * instead of inventing one from the raw move table. A fourth rule — multiPv
 * line-gap detection for missed chances — was folded into classify.ts's
 * `miss` quality tier as of the 2026-07-30 threshold-retuning; any move it
 * would have flagged is already tagged `miss` and reaches the planner via
 * the user-mistake rule instead.
 *
 * `evals[i]` is the engine evaluation of the position at `moves[i - 1]`'s
 * "before" state (index-aligned the same way as `classifyMoves`), needed
 * here for `turningPointMoments`'s starting-position eval.
 *
 * Not capped -- the planner prioritizes among however many are found. One
 * moment per ply: when multiple rules fire on the same ply, user_mistake
 * wins over instructive, which wins over turning_point.
 */
export function findCandidateMoments(moves: ClassifiedMove[], evals: EngineEval[]): CandidateMoment[] {
  const byPly = new Map<number, CandidateMoment>();
  addAll(byPly, userMistakeMoments(moves));
  addAll(byPly, instructiveMoments(moves));
  addAll(byPly, turningPointMoments(moves, evals));
  return [...byPly.values()].sort((a, b) => a.ply - b.ply);
}

function addAll(byPly: Map<number, CandidateMoment>, moments: CandidateMoment[]): void {
  for (const moment of moments) addIfHigherPriority(byPly, moment);
}

function addIfHigherPriority(byPly: Map<number, CandidateMoment>, moment: CandidateMoment): void {
  const existing = byPly.get(moment.ply);
  if (existing && KIND_PRIORITY[existing.kind] >= KIND_PRIORITY[moment.kind]) return;
  byPly.set(moment.ply, moment);
}

/** Rule (a): every mistake/inaccuracy/blunder/miss the user played. */
function userMistakeMoments(moves: ClassifiedMove[]): CandidateMoment[] {
  return moves
    .filter((move) => move.isUserMove && USER_MISTAKE_QUALITIES.has(move.quality))
    .map((move): CandidateMoment => ({ ply: move.ply, kind: 'user_mistake', cpLoss: move.cpLoss }));
}

/** Rule (b): the user's own brilliant/great moves — objective, engine-verified
 * "good decision" candidates for the planner's one non-mistake moment. */
function instructiveMoments(moves: ClassifiedMove[]): CandidateMoment[] {
  return moves
    .filter((move) => move.isUserMove && INSTRUCTIVE_QUALITIES.has(move.quality))
    .map((move): CandidateMoment => ({ ply: move.ply, kind: 'instructive', cpLoss: move.cpLoss }));
}

/** Rule (c): plies where the White-perspective win% crosses the
 * turning-point band, in either direction. */
function turningPointMoments(moves: ClassifiedMove[], evals: EngineEval[]): CandidateMoment[] {
  const cpSequence = [startingCp(evals), ...moves.map((move) => move.evalAfterCp)];
  const moments: CandidateMoment[] = [];
  for (let index = 1; index < cpSequence.length; index++) {
    const previousCp = cpSequence[index - 1];
    const currentCp = cpSequence[index];
    const move = moves[index - 1];
    if (previousCp === undefined || currentCp === undefined || !move) continue;
    if (zoneFor(previousCp) === zoneFor(currentCp)) continue;
    moments.push({ ply: move.ply, kind: 'turning_point', cpLoss: Math.abs(currentCp - previousCp) });
  }
  return moments;
}

function startingCp(evals: EngineEval[]): number {
  return whitePerspectiveCp(evals[0]?.lines[0]);
}

function zoneFor(cp: number): -1 | 0 | 1 {
  const winPct = winPctWhite(cp);
  if (winPct > TURNING_POINT_WINPCT_THRESHOLD) return 1;
  if (winPct < 100 - TURNING_POINT_WINPCT_THRESHOLD) return -1;
  return 0;
}

import { interpolateAnchors } from '@freechesscoach/shared';
import { aggregateAccuracy } from './game-accuracy.js';
import { moveAccuracy } from './accuracy-curve.js';
import { accuracyToElo } from './rating-estimate.js';

/**
 * How strong the coach plays in a live game against its student: the
 * student's usual level (their recent games' estimated rating), how well they
 * are playing THIS game, and a target the coach aims its own play at. The
 * target sits on the other side of the student's usual level from how they
 * are playing now, so a student who is playing above themselves tends to win
 * and one who is playing below themselves tends to lose.
 */
export interface CoachLevel {
  /** The student's usual level: their recent estimated rating, else what this
   * game shows, else `DEFAULT_LEVEL_ELO`. */
  levelElo: number;
  /** What this game's moves so far are worth, null until enough were played. */
  performanceElo: number | null;
  /** The strength the coach plays at this move. */
  targetElo: number;
}

export const DEFAULT_LEVEL_ELO = 1200;
const MIN_ELO = 300;
const MAX_ELO = 2300;
/** Student moves (out of book) before this game's play counts at all. */
const MIN_PERFORMANCE_MOVES = 4;
/** With no rating history, how many moves this game needs before it counts
 * as much as the default (n / (n + this)). */
const NO_PRIOR_SETTLE_MOVES = 10;
/** How far the coach's target moves per Elo the student is above/below
 * their usual level, and the most it ever moves. */
const TARGET_SWING = 0.6;
const MAX_TARGET_SWING = 300;

export interface CoachLevelInput {
  /** The student's recent estimated rating, null when they have none. */
  priorElo: number | null;
  /** Win-percentage drops of the student's own moves this game, book moves
   * left out. */
  studentDrops: readonly number[];
}

export function coachLevel(input: CoachLevelInput): CoachLevel {
  const performanceElo = performanceFromDrops(input.studentDrops);
  const levelElo = clampElo(usualLevel(input.priorElo, performanceElo, input.studentDrops.length));
  if (performanceElo === null) return { levelElo, performanceElo, targetElo: levelElo };

  const swing = clamp(TARGET_SWING * (levelElo - performanceElo), -MAX_TARGET_SWING, MAX_TARGET_SWING);
  return { levelElo, performanceElo, targetElo: Math.round(clampElo(levelElo + swing)) };
}

function performanceFromDrops(drops: readonly number[]): number | null {
  if (drops.length < MIN_PERFORMANCE_MOVES) return null;
  const accuracies = drops.map((drop) => moveAccuracy(drop));
  const accuracy = aggregateAccuracy(accuracies, accuracies.map(() => 1));
  return accuracy === null ? null : Math.round(accuracyToElo(accuracy));
}

function usualLevel(priorElo: number | null, performanceElo: number | null, moves: number): number {
  if (priorElo !== null) return priorElo;
  if (performanceElo === null) return DEFAULT_LEVEL_ELO;
  const weight = moves / (moves + NO_PRIOR_SETTLE_MOVES);
  return Math.round(DEFAULT_LEVEL_ELO + weight * (performanceElo - DEFAULT_LEVEL_ELO));
}

/** The win-percentage drop from which a player at `elo` reliably notices and
 * takes advantage of an opponent's mistake: a beginner only sees the big
 * ones, a strong player punishes the small ones too. */
const PUNISH_DROP_ANCHORS: ReadonlyArray<readonly [elo: number, drop: number]> = [
  [300, 30],
  [1000, 18],
  [1500, 12],
  [2300, 6]
];

export function punishThresholdDrop(elo: number): number {
  return interpolateAnchors(PUNISH_DROP_ANCHORS, elo, (lower, upper, t) => lower + t * (upper - lower));
}

/**
 * Does the coach punish the student's last move? Always, when it lost at
 * least what a player at the coach's target level reliably notices; half the
 * time for a mistake half that size; never for anything smaller (which is
 * left to the level's ordinary play).
 */
export function shouldPunish(lastStudentDrop: number | null, targetElo: number, random: () => number): boolean {
  if (lastStudentDrop === null) return false;
  const threshold = punishThresholdDrop(targetElo);
  if (lastStudentDrop >= threshold) return true;
  if (lastStudentDrop >= threshold / 2) return random() < 0.5;
  return false;
}

/** A deliberate mistake is at least this big a drop (a mistake, not an
 * inaccuracy — CONFIG.severity's inaccuracy band ends here). */
export const COACH_MISTAKE_MIN_DROP = 10;
/** The coach's own moves after a deliberate mistake before it may make
 * another, so mistakes never come in clusters the way a bot's dice do. */
export const COACH_MISTAKE_COOLDOWN_MOVES = 4;

/** `coachDrops` is the coach's own moves' drops this game, oldest first. */
export function mayMakeMistake(coachDrops: readonly number[]): boolean {
  return !coachDrops.slice(-COACH_MISTAKE_COOLDOWN_MOVES).some((drop) => drop >= COACH_MISTAKE_MIN_DROP);
}

function clampElo(elo: number): number {
  return clamp(elo, MIN_ELO, MAX_ELO);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

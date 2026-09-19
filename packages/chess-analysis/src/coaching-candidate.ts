import { TACTIC_MOTIF_TYPES, type TacticMotifCounts, type TacticMotifType } from '@freechesscoach/shared';
import { CONFIG } from './config.js';

export interface CoachingCandidateGame {
  gameId: string;
  tacticMotifs: TacticMotifCounts;
  playedAt: Date | null;
}

export interface CoachingCandidateMotif {
  motif: TacticMotifType;
  /** Chances the player had and did not take. */
  missed: number;
  /** Tactics the opponent had that the player did not defuse. */
  allowed: number;
}

export interface CoachingCandidate {
  gameId: string;
  points: number;
  /** The motifs behind the points, biggest first — so the UI can say why. */
  topMotifs: CoachingCandidateMotif[];
}

/** Absent `preventable`/`prevented` (a report from before they existed) mean
 * "not computed", so they count as 0 here — never NaN, never negative. */
function motifRowOf(counts: TacticMotifCounts[TacticMotifType]): { missed: number; allowed: number } {
  return {
    missed: Math.max(0, counts.opportunities - counts.found),
    allowed: Math.max(0, (counts.preventable ?? 0) - (counts.prevented ?? 0))
  };
}

function pointsOfRow({ missed, allowed }: { missed: number; allowed: number }): number {
  return missed * CONFIG.coachingCandidate.missedTacticWeight + allowed * CONFIG.coachingCandidate.allowedTacticWeight;
}

/** How much there is to coach in one game's tactics: tactics missed plus
 * tactics allowed. A heuristic ranking, not a rating. */
export function tacticalPointsOf(tacticMotifs: TacticMotifCounts): number {
  return TACTIC_MOTIF_TYPES.reduce((total, motif) => total + pointsOfRow(motifRowOf(tacticMotifs[motif])), 0);
}

function topMotifsOf(tacticMotifs: TacticMotifCounts): CoachingCandidateMotif[] {
  return TACTIC_MOTIF_TYPES.map((motif) => ({ motif, ...motifRowOf(tacticMotifs[motif]) }))
    .filter((row) => pointsOfRow(row) > 0)
    .sort((a, b) => pointsOfRow(b) - pointsOfRow(a))
    .slice(0, CONFIG.coachingCandidate.topMotifCount);
}

/** Highest points first; ties go to the more recently played game (an
 * unknown date counts as oldest), then the lowest id so the pick never
 * depends on input order. */
function compareCandidates(a: { game: CoachingCandidateGame; points: number }, b: { game: CoachingCandidateGame; points: number }): number {
  if (a.points !== b.points) return b.points - a.points;
  const aTime = a.game.playedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const bTime = b.game.playedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (aTime !== bTime) return bTime > aTime ? 1 : -1;
  return a.game.gameId < b.game.gameId ? -1 : a.game.gameId > b.game.gameId ? 1 : 0;
}

/** The game most worth a coaching session, or null with no games. A game
 * with 0 points is still returned when nothing scores higher — the caller
 * decides whether to surface it. Pure and programmatic: no AI. */
export function pickCoachingCandidate(games: CoachingCandidateGame[]): CoachingCandidate | null {
  const [best] = games.map((game) => ({ game, points: tacticalPointsOf(game.tacticMotifs) })).sort(compareCandidates);
  if (!best) return null;
  return { gameId: best.game.gameId, points: best.points, topMotifs: topMotifsOf(best.game.tacticMotifs) };
}

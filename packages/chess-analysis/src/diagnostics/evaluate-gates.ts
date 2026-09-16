import type { DataQualityGateId } from '@freechesscoach/shared';
import { CONFIG } from '../config.js';

/**
 * One window game's data-quality-relevant fields — deliberately narrower
 * than `GamesTable` (see `apps/api/src/db/schema.ts`): only what §4.2/§II.A
 * actually gate on, so the caller assembling this from a real query never
 * has to reverse-engineer which columns matter. Free-standing primitive,
 * same reasoning as `reachability.ts`/`hwdl.ts`/`resolve-episodes.ts` —
 * this module has no DB access of its own.
 */
export interface GateWindowGame {
  gameId: string;
  /** Exact `time_control` string as stored (e.g. `"600"`, `"600+5"`) —
   * §4.2: "Do not automatically combine 10+0 with 15+10 or 30+0." Pooling
   * must key on this exact string, never a derived speed class. */
  timeControl: string;
  /** `null` means unknown, not "assume rated" — DQ-01 only counts games
   * known to be rated. */
  rated: boolean | null;
  /** `null`/`'standard'` is ordinary chess; anything else is a variant. */
  variant: string | null;
  termination: string | null;
  userColor: 'white' | 'black';
  opening: string | null;
  opponentName: string | null;
  ratingAtGame: number | null;
  ratingProvisional: boolean;
  hasReliableClockData: boolean;
}

export interface GateEvaluationInput {
  games: readonly GateWindowGame[];
  /** `O` for the code under evaluation. */
  opportunities: number;
  /** Mean §4.5 human-reachability score across this code's opportunities. */
  meanReachability: number;
  /** How many raw incidents `resolveEpisodes`' DQ-11 cascade collapsing
   * merged away — purely informational surfacing of work it already did. */
  cascadeCollapsedCount: number;
  /** How many raw incidents were dropped because they occurred in a
   * completely decided position (`isCompletelyDecidedPosition`). */
  decidedPositionIncidentCount: number;
  /** Every raw incident recorded before that drop — `decidedPositionIncidentCount`
   * `<=` this. */
  totalIncidentCount: number;
  /** Whether the caller pre-filtered the window to only one result type —
   * this module can't see that from `games` alone, since a loss-only
   * sample looks identical to an unfiltered one at the schema level. */
  selectionBias: 'losses-only' | 'wins-only' | 'blunders-only' | null;
}

export interface FiredGate {
  code: DataQualityGateId;
  evidence: string;
}

function isStandardVariant(variant: string | null): boolean {
  return variant === null || variant.toLowerCase() === 'standard' || variant.toLowerCase() === 'chess';
}

function checkInsufficientGames(games: readonly GateWindowGame[]): FiredGate | null {
  const ratedCount = games.filter((game) => game.rated === true).length;
  if (ratedCount >= CONFIG.dataQualityGates.minRatedGames) return null;
  return {
    code: 'DQ-01',
    evidence: `${ratedCount} rated games in window (need >= ${CONFIG.dataQualityGates.minRatedGames})`
  };
}

function checkInsufficientOpportunities(input: GateEvaluationInput): FiredGate | null {
  if (input.opportunities >= CONFIG.dataQualityGates.minOpportunities) return null;
  return {
    code: 'DQ-02',
    evidence: `${input.opportunities} opportunities (need >= ${CONFIG.dataQualityGates.minOpportunities})`
  };
}

/** DQ-03 and DQ-15 share one underlying check (§II.A groups them together
 * as "mixed time-control pools" / "different Rapid formats pooled") — both
 * fire together off the same evidence. */
function checkMixedTimeControls(games: readonly GateWindowGame[]): FiredGate[] {
  const distinct = [...new Set(games.map((game) => game.timeControl))];
  if (distinct.length <= 1) return [];
  const evidence = `${distinct.length} distinct time controls pooled: ${distinct.join(', ')}`;
  return [
    { code: 'DQ-03', evidence },
    { code: 'DQ-15', evidence }
  ];
}

function checkMissingClockData(games: readonly GateWindowGame[]): FiredGate | null {
  if (games.length === 0) return null;
  const missing = games.filter((game) => !game.hasReliableClockData).length;
  if (missing / games.length <= CONFIG.dataQualityGates.maxClockMissingRatio) return null;
  return { code: 'DQ-04', evidence: `${missing}/${games.length} games missing reliable clock data` };
}

function checkReachability(input: GateEvaluationInput): FiredGate | null {
  if (input.opportunities === 0) return null;
  if (input.meanReachability >= CONFIG.humanReachability.dq05Threshold) return null;
  return {
    code: 'DQ-05',
    evidence: `mean reachability ${input.meanReachability.toFixed(2)} below the ${CONFIG.humanReachability.dq05Threshold} threshold`
  };
}

function dominantShare(
  games: readonly GateWindowGame[],
  key: (game: GateWindowGame) => string | null
): { value: string; share: number } | null {
  const counts = new Map<string, number>();
  for (const game of games) {
    const value = key(game);
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let best: { value: string; count: number } | null = null;
  for (const [value, count] of counts) {
    if (!best || count > best.count) best = { value, count };
  }
  if (!best || games.length === 0) return null;
  return { value: best.value, share: best.count / games.length };
}

function checkDominance(games: readonly GateWindowGame[]): FiredGate | null {
  const threshold = CONFIG.dataQualityGates.dominanceShareThreshold;
  const candidates: Array<{ label: string; result: ReturnType<typeof dominantShare> }> = [
    { label: 'opening', result: dominantShare(games, (game) => game.opening) },
    { label: 'opponent', result: dominantShare(games, (game) => game.opponentName) },
    { label: 'side', result: dominantShare(games, (game) => game.userColor) }
  ];

  for (const { label, result } of candidates) {
    if (result && result.share > threshold) {
      return {
        code: 'DQ-06',
        evidence: `${label} "${result.value}" is ${Math.round(result.share * 100)}% of the window`
      };
    }
  }
  return null;
}

function checkRatingStability(games: readonly GateWindowGame[]): FiredGate | null {
  if (games.length === 0) return null;

  const provisionalCount = games.filter((game) => game.ratingProvisional).length;
  if (provisionalCount > 0) {
    return { code: 'DQ-08', evidence: `${provisionalCount}/${games.length} games had a provisional rating` };
  }

  const ratings = games.map((game) => game.ratingAtGame).filter((rating): rating is number => rating !== null);
  if (ratings.length < 2) return null;
  const swing = Math.max(...ratings) - Math.min(...ratings);
  if (swing <= CONFIG.dataQualityGates.ratingSwingThreshold) return null;
  return { code: 'DQ-08', evidence: `rating swung ${swing} points across the window` };
}

function checkDecidedPositionsOnly(input: GateEvaluationInput): FiredGate | null {
  if (input.totalIncidentCount === 0) return null;
  if (input.decidedPositionIncidentCount < input.totalIncidentCount) return null;
  return {
    code: 'DQ-09',
    evidence: `all ${input.totalIncidentCount} recorded incident(s) occurred in a completely decided position`
  };
}

function checkCascadeCollapsing(input: GateEvaluationInput): FiredGate | null {
  if (input.cascadeCollapsedCount === 0) return null;
  return {
    code: 'DQ-11',
    evidence: `${input.cascadeCollapsedCount} recorded error(s) were merged into a single causal cascade`
  };
}

function checkNonstandardConditions(games: readonly GateWindowGame[]): FiredGate | null {
  const affected = games.filter((game) => !isStandardVariant(game.variant) || game.rated === false);
  if (affected.length === 0) return null;
  return { code: 'DQ-12', evidence: `${affected.length}/${games.length} games were a variant or unrated` };
}

const DISCONNECT_TERMINATION_PATTERN = /abandon|disconnect|lag|device|left the game/i;

function checkDisconnectTerminations(games: readonly GateWindowGame[]): FiredGate | null {
  const affected = games.filter((game) => game.termination !== null && DISCONNECT_TERMINATION_PATTERN.test(game.termination));
  if (affected.length === 0) return null;
  return {
    code: 'DQ-13',
    evidence: `${affected.length} game(s) ended in an apparent disconnect/interface failure: ${affected.map((game) => game.gameId).join(', ')}`
  };
}

function checkSelectionBias(input: GateEvaluationInput): FiredGate | null {
  if (input.selectionBias === null) return null;
  return { code: 'DQ-16', evidence: `sample was pre-filtered to ${input.selectionBias}` };
}

/**
 * Every gate the captured data can support (§II.A's own note: "The system
 * must be allowed to return Insufficient evidence"). Returns the gates that
 * fired with their evidence — never a bare boolean, so a caller (Task 55.3)
 * can explain *why* a code was gated rather than just that it was.
 */
export function evaluateGates(input: GateEvaluationInput): FiredGate[] {
  const fired: FiredGate[] = [];
  const push = (gate: FiredGate | null): void => {
    if (gate) fired.push(gate);
  };

  push(checkInsufficientGames(input.games));
  push(checkInsufficientOpportunities(input));
  fired.push(...checkMixedTimeControls(input.games));
  push(checkMissingClockData(input.games));
  push(checkReachability(input));
  push(checkDominance(input.games));
  push(checkRatingStability(input.games));
  push(checkDecidedPositionsOnly(input));
  push(checkCascadeCollapsing(input));
  push(checkNonstandardConditions(input.games));
  push(checkDisconnectTerminations(input.games));
  push(checkSelectionBias(input));

  return fired;
}

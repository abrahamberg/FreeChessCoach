import {
  DIAGNOSIS_CODES_BY_ID,
  SEVERITIES,
  type DiagnosisCodeId,
  type Direction,
  type EmittableConfidenceLevel,
  type HistoryStatus,
  type ScopeTag,
  type Severity
} from '@freechesscoach/shared';
import type { GameOpportunities } from './beta-binomial.js';
import { computeBetaBinomial } from './beta-binomial.js';
import { CONFIG } from '../config.js';
import type { DiagnosticEntry } from './diagnostic-entry.js';
import { deriveSessions, detectScopeTags } from './scope-tags.js';

export interface DiagnosticProfileSpread {
  games: number;
  sessions: number;
  openings: number;
  sides: number;
}

/** §VI requires an intact control skill in every finding — the same code's
 * opposite direction (offensive/defensive) when it has data and a healthy
 * rate; `null` when there's no such pairing or no evidence for it yet. */
export interface ControlSkill {
  code: DiagnosisCodeId;
  direction: Direction;
  failureRate: number;
}

export interface DiagnosticProfileEntry {
  code: DiagnosisCodeId;
  direction: Direction;
  opportunities: number;
  episodes: number;
  failureRate: number;
  posteriorMean: number;
  credibleInterval: [number, number];
  /** Never `'confirmed'` — see `EMITTABLE_CONFIDENCE_LEVELS`. */
  confidence: EmittableConfidenceLevel;
  spread: DiagnosticProfileSpread;
  totalHwdl: number;
  severityMix: Record<Severity, number>;
  meanReachability: number;
  scopeTags: ScopeTag[];
  controlSkill: ControlSkill | null;
  historyStatus: HistoryStatus;
}

/** What the caller stored from the previous window's profile for this same
 * code+direction+time-control — the only state `buildDiagnosticProfile`
 * needs to diff §III.1's history status. `aboveThreshold` is
 * `confidence !== 'insufficient'` from that prior run. */
export interface PreviousProfileEntry {
  code: DiagnosisCodeId;
  direction: Direction;
  historyStatus: HistoryStatus;
  aboveThreshold: boolean;
}

export interface BuildProfileInput {
  entries: readonly DiagnosticEntry[];
  studentRating: number;
  previousProfile?: readonly PreviousProfileEntry[];
}

function groupByCode(entries: readonly DiagnosticEntry[]): Map<string, DiagnosticEntry[]> {
  const groups = new Map<string, DiagnosticEntry[]>();
  for (const entry of entries) {
    const key = `${entry.code}:${entry.direction}`;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return groups;
}

function toGameOpportunities(entries: readonly DiagnosticEntry[]): GameOpportunities[] {
  const byGame = new Map<string, { opportunities: number; failures: number }>();
  for (const entry of entries) {
    const bucket = byGame.get(entry.gameId) ?? { opportunities: 0, failures: 0 };
    bucket.opportunities += 1;
    if (entry.failed) bucket.failures += 1;
    byGame.set(entry.gameId, bucket);
  }
  return [...byGame.entries()].map(([gameId, counts]) => ({ gameId, ...counts }));
}

function spreadOf(failedEntries: readonly DiagnosticEntry[], sessions: ReadonlyMap<string, number>): DiagnosticProfileSpread {
  return {
    games: new Set(failedEntries.map((entry) => entry.gameId)).size,
    sessions: new Set(failedEntries.map((entry) => sessions.get(entry.gameId) ?? -1)).size,
    openings: new Set(failedEntries.map((entry) => entry.opening).filter((opening): opening is string => opening !== null)).size,
    sides: new Set(failedEntries.map((entry) => entry.userColor)).size
  };
}

function severityMix(failedEntries: readonly DiagnosticEntry[]): Record<Severity, number> {
  const mix = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0])) as Record<Severity, number>;
  for (const entry of failedEntries) mix[entry.severity] += 1;
  return mix;
}

/** §4.6's own table, minus `'confirmed'` (no probe subsystem exists — see
 * `EMITTABLE_CONFIDENCE_LEVELS`). "Signal" needs at least two independent
 * episodes across more than one game; "Probable" needs the fuller
 * four-of-eight, three-games, two-sessions bar. */
function confidenceTier(opportunities: number, episodes: number, gamesSpread: number, sessionsSpread: number): EmittableConfidenceLevel {
  const c = CONFIG.diagnosticProfile;
  if (
    episodes >= c.confidenceProbableMinEpisodes &&
    opportunities >= c.confidenceProbableMinOpportunities &&
    gamesSpread >= c.confidenceProbableMinGames &&
    sessionsSpread >= c.confidenceProbableMinSessions
  ) {
    return 'probable';
  }
  if (episodes >= c.confidenceSignalMinEpisodes && gamesSpread >= c.confidenceSignalMinGames) return 'signal';
  return 'insufficient';
}

function findControlSkill(code: DiagnosisCodeId, direction: Direction, groups: ReadonlyMap<string, DiagnosticEntry[]>): ControlSkill | null {
  const catalogEntry = DIAGNOSIS_CODES_BY_ID.get(code);
  const opposite: Direction | null = direction === 'O' ? 'D' : direction === 'D' ? 'O' : null;
  if (!catalogEntry || !opposite || !catalogEntry.directions.includes(opposite)) return null;

  const oppositeEntries = groups.get(`${code}:${opposite}`);
  if (!oppositeEntries || oppositeEntries.length === 0) return null;

  const failureRate = oppositeEntries.filter((entry) => entry.failed).length / oppositeEntries.length;
  return failureRate <= CONFIG.diagnosticProfile.controlHealthyMaxFailureRate ? { code, direction: opposite, failureRate } : null;
}

/** §III.1, applied as a diff against the previous window's stored status —
 * `!prior` (never seen above threshold before, or no stored history at
 * all) reads `'newly_observed'` regardless of this window's own result,
 * since there's nothing yet to call persistent, resolved, or regressed. A
 * code that drops below threshold after being above it moves to
 * `'monitoring'` rather than straight to `'resolved'` (§III.1: "durable
 * transfer is unproven" until a *second* clean window confirms it). */
function nextHistoryStatus(aboveThresholdNow: boolean, prior: PreviousProfileEntry | undefined): HistoryStatus {
  if (!prior) return 'newly_observed';

  if (aboveThresholdNow) {
    if (prior.historyStatus === 'resolved') return 'regressed';
    return prior.aboveThreshold ? 'persistent' : 'newly_observed';
  }

  if (prior.aboveThreshold) return 'monitoring';
  return prior.historyStatus === 'monitoring' ? 'resolved' : prior.historyStatus;
}

/**
 * §4.3/§4.6/§III.1/§III.2 — the per-user diagnostic profile (Task 55.3), a
 * pure aggregator over a pre-resolved window (`StatsEntry`/
 * `buildStatsDashboard`'s own shape): one entry per code+direction that had
 * any opportunity in `input.entries`. An empty window yields `[]` — no
 * codes appeared, so there is nothing to call even `Insufficient` about.
 */
export function buildDiagnosticProfile(input: BuildProfileInput): DiagnosticProfileEntry[] {
  const groups = groupByCode(input.entries);
  const results: DiagnosticProfileEntry[] = [];

  for (const [key, groupEntries] of groups) {
    const [code, direction] = key.split(':') as [DiagnosisCodeId, Direction];
    const failedEntries = groupEntries.filter((entry) => entry.failed);
    const opportunities = groupEntries.length;
    const episodes = failedEntries.length;

    const sessions = deriveSessions(groupEntries);
    const spread = spreadOf(failedEntries, sessions);

    const ratingPrior = DIAGNOSIS_CODES_BY_ID.get(code)?.ratingPrior ?? CONFIG.diagnosticProfile.ratingPriorFallback;
    const betaBinomial = computeBetaBinomial({
      games: toGameOpportunities(groupEntries),
      ratingPrior,
      studentRating: input.studentRating
    });

    const confidence = confidenceTier(opportunities, episodes, spread.games, spread.sessions);
    const priorEntry = input.previousProfile?.find((entry) => entry.code === code && entry.direction === direction);

    results.push({
      code,
      direction,
      opportunities,
      episodes,
      failureRate: opportunities === 0 ? 0 : episodes / opportunities,
      posteriorMean: betaBinomial.posteriorMean,
      credibleInterval: betaBinomial.credibleInterval,
      confidence,
      spread,
      totalHwdl: failedEntries.reduce((sum, entry) => sum + entry.hwdl, 0),
      severityMix: severityMix(failedEntries),
      meanReachability: failedEntries.length === 0 ? 0 : failedEntries.reduce((sum, entry) => sum + entry.reachability, 0) / failedEntries.length,
      scopeTags: detectScopeTags(groupEntries),
      controlSkill: findControlSkill(code, direction, groups),
      historyStatus: nextHistoryStatus(confidence !== 'insufficient', priorEntry)
    });
  }

  return results.sort((a, b) => a.code.localeCompare(b.code) || a.direction.localeCompare(b.direction));
}

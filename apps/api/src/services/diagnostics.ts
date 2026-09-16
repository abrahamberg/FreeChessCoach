import { evaluateGates, type DiagnosticProfileEntry, type FiredGate, type GateWindowGame } from '@freechesscoach/chess-analysis';
import { DATA_QUALITY_GATES, DIAGNOSIS_CODES_BY_ID } from '@freechesscoach/shared';
import type {
  DiagnosisEntryResponse,
  DiagnosisCodeId,
  DiagnosticEvidenceResponse,
  DiagnosticsResponse,
  EmittableConfidenceLevel
} from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as diagnosticObservationsRepo from '../db/repositories/diagnostic-observations.js';
import * as diagnosticProfilesRepo from '../db/repositories/diagnostic-profiles.js';
import type { DiagnosticProfileRow } from '../db/repositories/diagnostic-profiles.js';
import * as gamesRepo from '../db/repositories/games.js';
import type { Database } from '../db/schema.js';
import { toGateWindowGame, windowByTimeControl } from './diagnostic-window.js';

const CONFIDENCE_RANK: Record<EmittableConfidenceLevel, number> = { probable: 2, signal: 1, insufficient: 0 };
const MAX_EVIDENCE_ITEMS = 50;

const EMPTY_RESPONSE = (timeControl: string | null): DiagnosticsResponse => ({
  timeControl,
  windowStart: null,
  windowEnd: null,
  computedAt: null,
  entries: []
});

/**
 * Task 58.1's `GET /api/users/me/diagnostics`. Reads the stored profile
 * (never recomputes it — that's the rebuild job's job, Task 56.4) and
 * evaluates data-quality gates live against the current window, the same
 * on-demand pattern `get_diagnostic_profile` (Task 57.2) uses — but over
 * every entry, not just the coach tool's top three: this is the student's
 * own full-detail view, not a curated coaching digest.
 */
export async function getDiagnosticsForUser(
  db: Kysely<Database>,
  userId: string,
  timeControl: string | null,
  windowEnd: Date | null
): Promise<DiagnosticsResponse> {
  const row = await resolveProfileRow(db, userId, timeControl, windowEnd);
  if (!row) return EMPTY_RESPONSE(timeControl);

  const allGames = await gamesRepo.listByUser(db, userId);
  const windowGames = (windowByTimeControl(allGames).get(row.timeControl) ?? []).map((windowed) =>
    toGateWindowGame(windowed.game)
  );

  const entries = [...row.profile]
    .sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] || b.episodes - a.episodes)
    .map((entry) => toEntryResponse(entry, evaluateGatesFor(entry, windowGames)));

  return {
    timeControl: row.timeControl,
    windowStart: row.windowStart.toISOString(),
    windowEnd: row.windowEnd.toISOString(),
    computedAt: row.computedAt.toISOString(),
    entries
  };
}

function resolveProfileRow(
  db: Kysely<Database>,
  userId: string,
  timeControl: string | null,
  windowEnd: Date | null
): Promise<DiagnosticProfileRow | undefined> {
  if (timeControl === null) return diagnosticProfilesRepo.latestProfileAnyTimeControl(db, userId);
  if (windowEnd === null) return diagnosticProfilesRepo.latestProfile(db, userId, timeControl);
  return diagnosticProfilesRepo.profileAt(db, userId, timeControl, windowEnd);
}

function evaluateGatesFor(entry: DiagnosticProfileEntry, windowGames: readonly GateWindowGame[]): readonly FiredGate[] {
  return evaluateGates({
    games: windowGames,
    opportunities: entry.opportunities,
    meanReachability: entry.meanReachability,
    // Task 57.2's same documented simplification: resolveEpisodes's
    // per-incident bookkeeping is never persisted onto a diagnostic
    // observation, so DQ-09/DQ-11 structurally can never fire here.
    cascadeCollapsedCount: 0,
    decidedPositionIncidentCount: 0,
    totalIncidentCount: entry.opportunities,
    selectionBias: null
  });
}

function toEntryResponse(entry: DiagnosticProfileEntry, firedGates: readonly FiredGate[]): DiagnosisEntryResponse {
  return {
    code: entry.code,
    label: DIAGNOSIS_CODES_BY_ID.get(entry.code)?.label ?? entry.code,
    direction: entry.direction,
    opportunities: entry.opportunities,
    episodes: entry.episodes,
    failureRate: entry.failureRate,
    confidence: entry.confidence,
    spread: entry.spread,
    severityMix: entry.severityMix,
    scopeTags: entry.scopeTags,
    controlSkill: entry.controlSkill && {
      code: entry.controlSkill.code,
      label: DIAGNOSIS_CODES_BY_ID.get(entry.controlSkill.code)?.label ?? entry.controlSkill.code,
      direction: entry.controlSkill.direction,
      failureRate: entry.controlSkill.failureRate
    },
    historyStatus: entry.historyStatus,
    firedGates: firedGates.map((gate) => ({
      code: gate.code,
      label: DATA_QUALITY_GATES.find((g) => g.id === gate.code)?.label ?? gate.code,
      evidence: gate.evidence
    }))
  };
}

/** Task 58.1's `GET /api/users/me/diagnostics/:code/evidence` — the actual
 * plies behind one code, newest first, capped (a running total can reach
 * into the hundreds over months of play; this is a drill-down list, not an
 * export). Caller (`routes/diagnostics.ts`) has already validated `code`
 * against the catalog. */
export async function getEvidenceForCode(
  db: Kysely<Database>,
  userId: string,
  code: DiagnosisCodeId
): Promise<DiagnosticEvidenceResponse> {
  const rows = await diagnosticObservationsRepo.listForUserAndCode(db, userId, code, MAX_EVIDENCE_ITEMS);
  return {
    code,
    label: DIAGNOSIS_CODES_BY_ID.get(code)?.label ?? code,
    items: rows.map((row) => ({
      gameId: row.gameId,
      ply: row.ply,
      direction: row.direction,
      failed: row.failed,
      hwdl: row.hwdl,
      severity: row.severity,
      reachability: row.reachability,
      createdAt: row.createdAt.toISOString()
    }))
  };
}

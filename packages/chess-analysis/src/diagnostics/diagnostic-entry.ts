import type { DiagnosisCodeId, Direction, MovePhase, Severity } from '@freechesscoach/shared';

/**
 * One opportunity for one code+direction, already resolved by the caller —
 * same `StatsEntry`/`buildStatsDashboard` shape (Phase 27-28): a plain,
 * pre-resolved record `buildDiagnosticProfile` aggregates over, with every
 * DB read/query done upstream. A `failed: true` entry is expected to
 * already be one post-cascade-collapse, post-`DQ-09`-filter episode
 * (`resolveEpisodes`' output, Task 54.3) — the caller runs that per game
 * and emits one entry per surviving `Episode.primary` (plus one
 * non-failed entry per opportunity that didn't fail), so this aggregator
 * never re-collapses cascades itself. `playedAt` is expected to already
 * combine the DB's separate `played_at` date and `played_at_time` time-of-
 * day columns into one real timestamp, since session derivation (§III.2)
 * needs true gaps between games, not just calendar dates.
 */
export interface DiagnosticEntry {
  code: DiagnosisCodeId;
  direction: Direction;
  gameId: string;
  failed: boolean;
  /** Only meaningful when `failed` — 0 for a successful opportunity. */
  hwdl: number;
  /** Only meaningful when `failed`. */
  severity: Severity;
  /** §4.5 human-reachability score for this opportunity's required
   * improvement, `[0, 1]`. */
  reachability: number;
  opening: string | null;
  userColor: 'white' | 'black';
  phase: MovePhase | null;
  clockRemainingMs: number | null;
  /** Position-complexity score at this opportunity (same scale as
   * `rating-estimate.ts`'s `complexity`), or `null` when unavailable. */
  complexity: number | null;
  opponentRating: number | null;
  playedAt: Date;
}

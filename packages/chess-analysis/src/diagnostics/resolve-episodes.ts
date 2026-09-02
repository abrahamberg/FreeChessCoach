import { DIAGNOSIS_FAMILIES, type DiagnosisCodeId, type DiagnosisFamily } from '@freechesscoach/shared';
import { CONFIG } from '../config.js';
import { DIAGNOSTIC_DETECTORS } from './registry.js';
import type { DiagnosticObservation } from './types.js';

/**
 * One ply's already-detected observations plus the win% context
 * `resolveEpisodes` needs (independent of `PlyDiagnosticContext` — same
 * free-standing-primitive reasoning as `reachability.ts`/`hwdl.ts`: the
 * caller assembles this from a batch registry run over a game, which this
 * phase doesn't wire up yet).
 */
export interface EpisodePly {
  ply: number;
  /** Mover-perspective win% (0-100) before/after this ply's move. */
  winPctBefore: number;
  winPctAfter: number;
  /** Every observation the registry produced for this ply — both `failed`
   * and not; `resolveEpisodes` itself filters to `failed: true` (§4.4: an
   * unfailed observation is a success, not an incident to explain). */
  observations: readonly DiagnosticObservation[];
}

/**
 * One causal incident: a single upstream `primary` diagnosis (§I.3) with
 * every other observation describing the same incident folded in as
 * `secondary` — never counted as independent weaknesses. `plies` is every
 * ply the incident spans, ascending; length 1 unless `DQ-11` cascade
 * collapsing merged consecutive plies whose win% never recovered.
 */
export interface Episode {
  primary: DiagnosticObservation;
  secondary: DiagnosticObservation[];
  plies: number[];
}

const { dampingHighWin: DAMPING_HIGH_WIN, dampingLowWin: DAMPING_LOW_WIN } = CONFIG.severity;

/**
 * `DQ-09`: "incidents occurred only in completely lost or trivially won
 * positions" — both readings pinned at the same extreme (reusing
 * `CONFIG.severity`'s own damping thresholds, not new magic numbers).
 * Deliberately narrower than `hwdl.ts`'s `isAlreadyDecidedPosition`, which
 * also damps a technically-drawn quiet position — DQ-09 is only about
 * "lost" or "won", not "drawn".
 */
export function isCompletelyDecidedPosition(winPctBefore: number, winPctAfter: number): boolean {
  return (
    (winPctBefore >= DAMPING_HIGH_WIN && winPctAfter >= DAMPING_HIGH_WIN) ||
    (winPctBefore <= DAMPING_LOW_WIN && winPctAfter <= DAMPING_LOW_WIN)
  );
}

const REGISTRY_PRIORITY = new Map(DIAGNOSTIC_DETECTORS.map((detector) => [`${detector.code}:${detector.direction}`, detector.priority]));

function familyRank(code: DiagnosisCodeId): number {
  const index = DIAGNOSIS_FAMILIES.indexOf(code.slice(0, 2) as DiagnosisFamily);
  return index === -1 ? DIAGNOSIS_FAMILIES.length : index;
}

/**
 * §I.3's ordering (rules → board model → board update → scan/process →
 * recognition → candidate generation → calculation → judgment → state),
 * applied at two tiers: first each code's family rank in
 * `DIAGNOSIS_FAMILIES` (itself already ordered per that same chain — see
 * its doc comment), which alone settles a cross-family tie (e.g. `BV-*`
 * before `TA-*`) even for a catalog code with no live detector yet; then,
 * within the same family, `DIAGNOSTIC_DETECTORS`' own priority order (that
 * registry's doc comment: "Task 54.3's precedence pass resolves ties by
 * walking this order").
 */
function comparePrecedence(a: DiagnosticObservation, b: DiagnosticObservation): number {
  const familyDelta = familyRank(a.code) - familyRank(b.code);
  if (familyDelta !== 0) return familyDelta;

  const aPriority = REGISTRY_PRIORITY.get(`${a.code}:${a.direction}`) ?? Number.MAX_SAFE_INTEGER;
  const bPriority = REGISTRY_PRIORITY.get(`${b.code}:${b.direction}`) ?? Number.MAX_SAFE_INTEGER;
  if (aPriority !== bPriority) return aPriority - bPriority;

  return a.code.localeCompare(b.code);
}

interface OpenEpisode {
  /** The win% the position stood at right before the incident's first
   * error — the cascade stays open until a later ply's win% climbs back
   * above this, per `DQ-11`. */
  recoveryThreshold: number;
  observations: DiagnosticObservation[];
  plies: number[];
}

function finalize(open: OpenEpisode): Episode {
  const [primary, ...secondary] = [...open.observations].sort(comparePrecedence);
  if (!primary) throw new Error('resolveEpisodes: an open episode must have at least one observation');
  return { primary, secondary, plies: open.plies };
}

/**
 * §I.3 causal precedence + `DQ-11` cascade collapsing + `DQ-09` filtering,
 * over one already-ordered (ascending `ply`) sequence of per-ply
 * observations — this is what stops one blunder from being reported as
 * five independent weaknesses (Task 54.3).
 */
export function resolveEpisodes(plies: readonly EpisodePly[]): Episode[] {
  const episodes: Episode[] = [];
  let open: OpenEpisode | null = null;

  for (const ply of plies) {
    const failed = isCompletelyDecidedPosition(ply.winPctBefore, ply.winPctAfter)
      ? []
      : ply.observations.filter((observation) => observation.failed);

    if (open && ply.winPctAfter > open.recoveryThreshold) {
      episodes.push(finalize(open));
      open = null;
    }

    if (failed.length > 0) {
      if (!open) open = { recoveryThreshold: ply.winPctBefore, observations: [], plies: [] };
      open.observations.push(...failed);
      open.plies.push(ply.ply);
    } else if (open) {
      // Still inside the cascade window (win% hasn't recovered) even
      // though this particular ply had nothing newly flagged — it's still
      // part of the same incident's span.
      open.plies.push(ply.ply);
    }
  }

  if (open) episodes.push(finalize(open));
  return episodes;
}

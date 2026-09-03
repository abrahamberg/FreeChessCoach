import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { DiagnosisCodeId, TacticMotifType } from '@freechesscoach/shared';
import { buildAttackMap } from '../attack-map.js';
import { forks } from '../tactics.js';
import { pins } from '../tactic-pins.js';

/** The position/move whose replay determines a fork's forking piece or a
 * pin's absolute/relative kind — for `tacticOpportunity` this is
 * `{fenBefore: ctx.fenBefore, moveSan: ctx.bestMoveSan}` (the engine's top
 * move, the one the motif was classified from — see
 * `classifyTacticMotifOpportunity`'s doc comment), not `ctx.moveSan` (what
 * the player actually played, when different). */
export interface MotifReplay {
  fenBefore: string;
  moveSan: string;
}

/** Motif types with exactly one code regardless of piece/kind — §II.E's
 * `docs/plan.md` Task 53.5 mapping list. */
const DIRECT_CODE_BY_MOTIF: Partial<Record<TacticMotifType, DiagnosisCodeId>> = {
  checkmate: 'TA-01',
  weakBackRank: 'TA-04',
  skewer: 'TA-14',
  discoveredAttack: 'TA-16',
  doubleCheck: 'TA-17',
  removesDefender: 'TA-18',
  overloadedDefender: 'TA-19',
  trappedPiece: 'TA-26',
  freePiece: 'TA-43'
};

const FORK_CODE_BY_PIECE: Record<PieceSymbol, DiagnosisCodeId | null> = {
  n: 'TA-07',
  p: 'TA-08',
  k: 'TA-09',
  b: 'TA-10',
  r: 'TA-10',
  q: 'TA-10'
};

const PIN_CODE_BY_KIND: Record<'absolute' | 'relative', DiagnosisCodeId> = {
  absolute: 'TA-11',
  relative: 'TA-12'
};

/** Every code `motifToCode` can actually produce, derived from the same
 * tables the function itself reads — never a hand-typed second list, so it
 * can't drift out of sync with what resolution actually does. Used by
 * Phase 60/61's bot roster to enforce that a bot is only ever "documented"
 * with a diagnosis code its move selection can genuinely exhibit — see
 * docs/plan.md's Phase 61. */
export const MOTIF_RESOLVABLE_DIAGNOSIS_CODES: readonly DiagnosisCodeId[] = Array.from(
  new Set([
    ...Object.values(DIRECT_CODE_BY_MOTIF),
    ...Object.values(FORK_CODE_BY_PIECE).filter((code): code is DiagnosisCodeId => code !== null),
    ...Object.values(PIN_CODE_BY_KIND)
  ])
).sort();

/**
 * `fork` and `pin` split into several codes by the specific piece/kind
 * involved, which the raw `{type, found, detail}` shape on
 * `tacticOpportunity`/`tacticPrevention` doesn't carry — this replays the
 * embodying move (a pure board computation, not an engine call, the same
 * one-off pattern `tactic-detectors/context.ts` uses) to recover it from
 * `forks()`/`pins()`.
 *
 * Returns `null` for `brilliantSacrifice`/`other` (no catalog code), for
 * `fork`/`pin` when `replay` is omitted or the replayed move doesn't
 * actually produce that motif at its destination (stale/mismatched data),
 * and for every other motif type when no `replay` is needed at all.
 */
export function motifToCode(type: TacticMotifType, replay?: MotifReplay): DiagnosisCodeId | null {
  const direct = DIRECT_CODE_BY_MOTIF[type];
  if (direct) return direct;
  if (!replay) return null;

  if (type === 'fork') return forkCode(replay);
  if (type === 'pin') return pinCode(replay);
  return null;
}

function replay(replayInput: MotifReplay): { after: Chess; destination: Square } | null {
  try {
    const after = new Chess(replayInput.fenBefore);
    const move = after.move(replayInput.moveSan);
    return move ? { after, destination: move.to as Square } : null;
  } catch {
    return null;
  }
}

function forkCode(replayInput: MotifReplay): DiagnosisCodeId | null {
  const replayed = replay(replayInput);
  if (!replayed) return null;

  const hit = forks(replayed.after, buildAttackMap(replayed.after)).find((f) => f.square === replayed.destination);
  return hit ? FORK_CODE_BY_PIECE[hit.piece] : null;
}

function pinCode(replayInput: MotifReplay): DiagnosisCodeId | null {
  const replayed = replay(replayInput);
  if (!replayed) return null;

  const hit = pins(replayed.after).find((p) => p.by === replayed.destination);
  return hit ? PIN_CODE_BY_KIND[hit.kind] : null;
}

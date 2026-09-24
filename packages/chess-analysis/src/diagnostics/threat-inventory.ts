import { Chess, type Square } from 'chess.js';
import type { ChecksCapturesThreats } from '@freechesscoach/shared';
import { applySanSequence, type AppliedMove } from '../apply-san-sequence.js';
import { CONFIG } from '../config.js';
import { flipActiveColorFen } from '../null-move-fen.js';
import { materialBalance } from '../tactic-board-facts.js';
import type { PlyDiagnosticContext } from './context.js';
import { lossConfirmed } from './eval-verdict.js';
import { nullMoveScanOf } from './null-move-scan.js';
import { dangerousCaptureTarget, dangerousCheckTarget, dangerousQuietThreatTarget, directThreatTarget } from './threat-danger.js';

export type ThreatKind = 'check' | 'capture' | 'threat';

/** One of the opponent's forcing moves that is actually dangerous. */
export interface Threat {
  kind: ThreatKind;
  moveSan: string;
  /** The square the danger lands on: the captured or attacked piece's
   * square, or the mover's king square for a check. */
  target: Square;
}

const { maxLinePlies: MAX_LINE_PLIES } = CONFIG.tacticVerification;
const { minThreatSeeCp: MIN_THREAT_SEE_CP } = CONFIG.evalWitness;

/**
 * The opponent's dangerous forcing moves as the position stood *before* the
 * mover's move — what the mover had to see. Asked with a null move on
 * `fenBefore`, so empty when the mover was in check (no null move exists).
 */
export function opponentThreatsBefore(ctx: PlyDiagnosticContext, kind: ThreatKind): Threat[] {
  const scan = nullMoveScanOf(ctx);
  if (!scan) return [];
  return dangerousThreats(scan.fen, scan.checksCapturesThreats, kind);
}

/**
 * The opponent's *direct* threats before the mover's move: a mate in one, or
 * a promotion that survives, if the mover passed. This is what §II.D's MS-03
 * ("misses mate, promotion, ... or another direct one-move threat") means
 * the mover had to answer. A quiet move that would *create* an attack next
 * turn is a threat to make a threat, not one to answer now. Counting it
 * turned MS-03 into an opportunity on almost half of all plies.
 */
export function opponentDirectThreatsBefore(ctx: PlyDiagnosticContext): Threat[] {
  const fen = flipActiveColorFen(ctx.fenBefore);
  if (!fen) return [];
  return new Chess(fen).moves({ verbose: true }).flatMap((move) => {
    const target = directThreatTarget(fen, move);
    return target ? [{ kind: 'threat' as const, moveSan: move.san, target }] : [];
  });
}

/** The opponent's dangerous forcing moves left standing after the mover's
 * move (`fenAfter`, the opponent already to move). */
export function opponentThreatsAfter(ctx: PlyDiagnosticContext, kind: ThreatKind): Threat[] {
  return dangerousThreats(ctx.fenAfter, ctx.opponentChecksCapturesThreats, kind);
}

/**
 * The threats that actually cost the mover: the eval confirms a loss, and
 * the engine's refutation carries the threat out — it plays the threat
 * move, captures on the threat's target, or (for a check) mates. With no
 * refutation line (the live path) the static danger is enough.
 */
export function realizedThreats(ctx: PlyDiagnosticContext, threats: readonly Threat[]): Threat[] {
  if (!lossConfirmed(ctx)) return [];
  const walked = walkedRefutation(ctx);
  if (!walked) return [...threats];
  return threats.filter((threat) => isAttributed(ctx, threat, walked));
}

/** Only the threats that land on one of `squares` — e.g. the captures that
 * would win one particular hanging piece. */
export function threatsOn(threats: readonly Threat[], squares: Iterable<string>): Threat[] {
  const wanted = new Set<string>(squares);
  return threats.filter((threat) => wanted.has(threat.target));
}

/**
 * The engine's refutation replayed from `fenAfter`, capped at
 * `CONFIG.tacticVerification.maxLinePlies`. Even indexes are the opponent's
 * moves. `null` when there is no refutation line (the live path, or the
 * game's last move).
 */
export function walkedRefutation(ctx: Pick<PlyDiagnosticContext, 'fenAfter' | 'refutationPvSan'>): AppliedMove[] | null {
  const line = ctx.refutationPvSan;
  if (!line || line.length === 0) return null;
  return applySanSequence(ctx.fenAfter, line.slice(0, MAX_LINE_PLIES)).moves;
}

/**
 * Does the refutation actually win something on `square`? The opponent has to
 * capture there, and one ply later (so the mover's immediate recapture is
 * included) the mover must be down at least `minThreatSeeCp` of material
 * compared with *before their move*. Without that second test an ordinary
 * exchange counts: `cxd5 Nxd5` "loses" the pawn on d5 while the material
 * never changed, and the eval dropped because of something else.
 */
export function refutationWinsOn(ctx: RefutationContext, walked: readonly AppliedMove[], square: Square): boolean {
  return walked.some((move, index) => index % 2 === 0 && capturesOn(move, square) && refutationCostsMaterial(ctx, walked, index + 1));
}

/** The mover is at least `minThreatSeeCp` of material down after
 * `walked[upTo]` (clamped to the line's end), measured against `fenBefore`,
 * or the line mates them. */
export function refutationCostsMaterial(ctx: RefutationContext, walked: readonly AppliedMove[], upTo: number = walked.length - 1): boolean {
  if (opponentMovesOf(walked).some((move) => move.san.endsWith('#'))) return true;
  const last = walked[Math.min(upTo, walked.length - 1)];
  if (!last) return false;
  const colour = ctx.mover === 'white' ? 'w' : 'b';
  const lost = materialBalance(new Chess(ctx.fenBefore), colour) - materialBalance(new Chess(last.fen), colour);
  return lost * 100 >= MIN_THREAT_SEE_CP;
}

type RefutationContext = Pick<PlyDiagnosticContext, 'fenBefore' | 'mover'>;

function dangerousThreats(fen: string, cct: ChecksCapturesThreats, kind: ThreatKind): Threat[] {
  if (kind === 'capture') return collect(kind, cct.captures.moves, (move) => dangerousCaptureTarget(fen, move));
  if (kind === 'check') return collect(kind, cct.checks.moves, (move) => dangerousCheckTarget(fen, move));
  return collect(kind, cct.threats.moves, (move) => dangerousQuietThreatTarget(fen, move));
}

function collect<T extends { moveSan: string }>(
  kind: ThreatKind,
  moves: readonly T[],
  targetOf: (move: T) => Square | null
): Threat[] {
  return moves.flatMap((move) => {
    const target = targetOf(move);
    return target ? [{ kind, moveSan: move.moveSan, target }] : [];
  });
}

function isAttributed(ctx: RefutationContext, threat: Threat, walked: readonly AppliedMove[]): boolean {
  if (walked[0]?.san === threat.moveSan) return refutationCostsMaterial(ctx, walked);
  if (refutationWinsOn(ctx, walked, threat.target)) return true;
  return threat.kind === 'check' && opponentMovesOf(walked).some((move) => move.san.endsWith('#'));
}

function opponentMovesOf(walked: readonly AppliedMove[]): AppliedMove[] {
  return walked.filter((_, index) => index % 2 === 0);
}

function capturesOn(move: AppliedMove, square: Square): boolean {
  return move.san.includes('x') && move.uci.slice(2, 4) === square;
}

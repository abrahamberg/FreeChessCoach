import type { Square } from 'chess.js';
import type { DiagnosisCodeId } from '@freechesscoach/shared';
import { CONFIG } from '../../config.js';
import { see } from '../../see.js';
import { missedChance, realChance } from '../chance-inventory.js';
import type { PlyDiagnosticContext } from '../context.js';
import { buildEvalObservation } from '../eval-verdict.js';
import type { DiagnosticObservation } from '../types.js';

/** Every check the mover had at `fenBefore`, the played one included. */
export function ownCheckSans(ctx: PlyDiagnosticContext): string[] {
  return (ctx.checksCapturesThreats?.checks.moves ?? []).map((move) => move.moveSan);
}

/** Every quiet threat the mover had at `fenBefore`, the played one included. */
export function ownThreatSans(ctx: PlyDiagnosticContext): string[] {
  return (ctx.checksCapturesThreats?.threats.moves ?? []).map((move) => move.moveSan);
}

/** The mover's captures that win at least `minThreatSeeCp` on the exchange. */
export function ownWinningCaptureSans(ctx: PlyDiagnosticContext): string[] {
  const minSee = CONFIG.evalWitness.minThreatSeeCp;
  return (ctx.checksCapturesThreats?.captures.moves ?? [])
    .filter((move) => see(ctx.fenBefore, move.to as Square, ctx.mover) >= minSee)
    .map((move) => move.moveSan);
}

/** The mover's captures of an enemy piece that had no defender at `fenBefore`. */
export function ownFreePieceCaptureSans(ctx: PlyDiagnosticContext): string[] {
  const hangingSquares = new Set(
    ctx.featuresBefore.hangingPieces.filter((piece) => piece.color !== ctx.mover).map((piece) => piece.square)
  );
  return (ctx.checksCapturesThreats?.captures.moves ?? [])
    .filter((move) => hangingSquares.has(move.to))
    .map((move) => move.moveSan);
}

/**
 * The shared verdict of every "did the student use their own chance" code
 * (MS-04/05/06, BV-02): an opportunity only when one of `chanceSans` is a
 * real chance by the engine's lines (`realChance`), a failure only when the
 * student played something else and the eval confirms it cost them
 * (`missedChance`).
 */
export function ownChanceObservation(
  ctx: PlyDiagnosticContext,
  code: DiagnosisCodeId,
  chanceSans: readonly string[],
  noun: string
): DiagnosticObservation | null {
  if (chanceSans.length === 0) return null;
  const chance = realChance(ctx, chanceSans);
  if (!chance) return null;

  const failed = missedChance(ctx, chanceSans, chance);
  return buildEvalObservation(ctx, code, 'O', failed, chanceDetail(ctx, chanceSans, chance.san, failed, noun));
}

function chanceDetail(
  ctx: PlyDiagnosticContext,
  chanceSans: readonly string[],
  chanceSan: string,
  failed: boolean,
  noun: string
): string {
  if (chanceSans.includes(ctx.moveSan)) return `played ${noun} ${ctx.moveSan}`;
  if (failed) return `missed ${noun} ${chanceSan} and played ${ctx.moveSan}, which cost value`;
  return `did not play ${noun} ${chanceSan}, but ${ctx.moveSan} kept the same value`;
}

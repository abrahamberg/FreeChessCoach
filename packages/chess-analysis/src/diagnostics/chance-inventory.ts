import { evalGap, moverCp } from '../eval-witness.js';
import type { PlyDiagnosticContext } from './context.js';
import { qualityFailed } from './detectors/shared.js';

/** One of the student's own chances, with the engine's eval for it
 * (White-perspective, as stored). */
export interface RealChance {
  san: string;
  cpWhite: number;
}

interface EngineLine {
  san: string;
  cpWhite: number;
}

type ChanceContext = Pick<
  PlyDiagnosticContext,
  'moveSan' | 'mover' | 'bestMoveSan' | 'cpBefore' | 'cpAfter' | 'alternatives' | 'quality'
>;

/** The engine's eval for `san` at this ply: the best line's `cpBefore`, a
 * matching alternative's `cp`, or undefined when the engine never looked at
 * the move. */
export function lineCpFor(ctx: ChanceContext, san: string): number | undefined {
  if (san === ctx.bestMoveSan) return ctx.cpBefore;
  return ctx.alternatives?.find((line) => line.san === san)?.cp;
}

/**
 * The best-evaluated of `chanceSans` among the engine's lines, when it is a
 * real chance: meaningfully better (`evalGap`) than the reference — the best
 * engine line that is not a chance, else the played move when it is not a
 * chance, else nothing (every good move here is a chance, so it counts).
 * A chance the engine never lists is never real: that is the
 * poisoned-capture filter.
 */
export function realChance(ctx: ChanceContext, chanceSans: readonly string[]): RealChance | null {
  const lines = engineLines(ctx);
  const chance = bestFor(ctx, lines.filter((line) => chanceSans.includes(line.san)));
  if (!chance) return null;

  const referenceCp = referenceCpFor(ctx, lines, chanceSans);
  if (referenceCp === undefined) return chance;
  return evalGap(chance.cpWhite, referenceCp, ctx.mover).meaningful ? chance : null;
}

/**
 * The student played something other than a chance, and that cost them
 * meaningfully against the chance's eval. A legacy move without `cpAfter`
 * falls back to its own quality.
 */
export function missedChance(ctx: ChanceContext, chanceSans: readonly string[], chance: RealChance): boolean {
  if (chanceSans.includes(ctx.moveSan)) return false;
  if (ctx.cpAfter === undefined) return qualityFailed(ctx.quality);
  return evalGap(chance.cpWhite, ctx.cpAfter, ctx.mover).meaningful;
}

function engineLines(ctx: ChanceContext): EngineLine[] {
  const best = ctx.bestMoveSan !== undefined && ctx.cpBefore !== undefined ? [{ san: ctx.bestMoveSan, cpWhite: ctx.cpBefore }] : [];
  const alternatives = (ctx.alternatives ?? []).map((line) => ({ san: line.san, cpWhite: line.cp }));
  return [...best, ...alternatives];
}

function referenceCpFor(ctx: ChanceContext, lines: readonly EngineLine[], chanceSans: readonly string[]): number | undefined {
  const bestOther = bestFor(ctx, lines.filter((line) => !chanceSans.includes(line.san)));
  if (bestOther) return bestOther.cpWhite;
  if (!chanceSans.includes(ctx.moveSan)) return ctx.cpAfter;
  return undefined;
}

function bestFor(ctx: ChanceContext, lines: readonly EngineLine[]): RealChance | null {
  return lines.reduce<RealChance | null>(
    (best, line) => (!best || moverCp(line.cpWhite, ctx.mover) > moverCp(best.cpWhite, ctx.mover) ? line : best),
    null
  );
}

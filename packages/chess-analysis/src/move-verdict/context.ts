import type { TacticMotifOpportunity } from '../game-tactic-motifs.js';
import { previousMoveOf } from '../previous-move-of.js';
import { toCpWhite } from '../win-probability.js';
import type { MoveVerdictDeps } from './deps.js';
import type { VerdictFrame } from './gate.js';
import type { LineValue } from './line-value.js';
import type { MoveVerdictInput } from './types.js';

/** A value computed on first read and remembered — what makes a skipped
 * check free. `peek` reads it without computing it. */
export class Lazy<T> {
  private computed: { value: T } | null = null;

  constructor(private readonly compute: () => T) {}

  get(): T {
    this.computed ??= { value: this.compute() };
    return this.computed.value;
  }

  peek(): { value: T } | null {
    return this.computed;
  }
}

/**
 * One move's shared, lazily computed facts. Checks share them, so the
 * detector run for "missed" is the one "found" and "missed mate" read too,
 * and nothing is computed for a check that never runs.
 */
export interface VerdictContext {
  input: MoveVerdictInput;
  deps: MoveVerdictDeps;
  frame: VerdictFrame;
  /** `classifyTacticChance` on the move itself: the missed/found card. */
  chance: Lazy<TacticMotifOpportunity | null>;
  /** The same on the opponent's reply: the allowed card. */
  nextChance: Lazy<TacticMotifOpportunity | null>;
  /** R's White-perspective cp, `null` when no line carries another
   * headline (or the best move carries none). */
  reference: Lazy<number | null>;
  /** The best line, walked from `fenBefore`. */
  bestWalk: Lazy<LineValue>;
  /** The played move plus the engine's line after it, from `fenBefore` —
   * the refutation for a failure, the continuation for a credit. */
  playedWalk: Lazy<LineValue>;
}

export function buildVerdictContext(input: MoveVerdictInput, deps: MoveVerdictDeps, frame: VerdictFrame): VerdictContext {
  const chance = new Lazy(() => deps.classifyTacticChance(input.move, input.evals, input.previous));
  return {
    input,
    deps,
    frame,
    chance,
    nextChance: new Lazy(() => nextChanceOf(input, deps)),
    reference: new Lazy(() => referenceOf(input, deps, frame, chance.get())),
    bestWalk: new Lazy(() => {
      const { bestLine } = frame;
      return deps.walkLineValue(frame.fenBefore, bestLine.pvSan ?? [bestLine.moveSan], frame.mover, bestLine);
    }),
    playedWalk: new Lazy(() => {
      const after = frame.afterLine;
      const reply = after ? (after.pvSan ?? [after.moveSan]) : [];
      return deps.walkLineValue(frame.fenBefore, [input.move.moveSan, ...reply], frame.mover, after);
    })
  };
}

function nextChanceOf(input: MoveVerdictInput, deps: MoveVerdictDeps): TacticMotifOpportunity | null {
  const { move, next, evals } = input;
  if (!next || next.ply !== move.ply + 1) return null;
  return deps.classifyTacticChance(next, evals, previousMoveOf([move], next.ply));
}

function referenceOf(
  input: MoveVerdictInput,
  deps: MoveVerdictDeps,
  frame: VerdictFrame,
  chance: TacticMotifOpportunity | null
): number | null {
  if (!chance) return null;
  const lines = input.evals[input.move.ply - 1]?.lines.slice(1) ?? [];
  const line = deps.firstLineWithOtherHeadline(input.move, frame.fenBefore, lines, chance.type);
  return line ? toCpWhite(line) : null;
}

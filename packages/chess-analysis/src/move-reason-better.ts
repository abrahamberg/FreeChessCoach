import type { EngineEval, MoveQuality } from '@freechesscoach/shared';
import { abandonedGuard, betterMoveFacts } from './board-facts/better-move.js';
import { lineBalance, settledLine } from './board-facts/material.js';
import { CONFIG } from './config.js';
import { PIECE_NAMES } from './piece-names.js';

export interface BetterMoveInput {
  fenBefore: string;
  moveSan: string;
  quality?: MoveQuality;
  /** The user's own move: "Your queen stopped guarding…" reads to them. */
  isUserMove: boolean;
  evalBefore: EngineEval;
  evalAfter?: EngineEval;
}

const COSTLY = new Set<MoveQuality>(['mistake', 'blunder', 'miss']);

/** What a costly move gave up, and why the engine's move was better, from the
 * board facts (`board-facts/better-move.ts`). Only the user's own mistakes,
 * blunders and misses: the same sentence on an opponent's move would explain
 * their error to the wrong reader. */
export function betterMoveReasons(input: BetterMoveInput): { stopped: string[]; better: string[] } {
  if (!input.isUserMove || !input.quality || !COSTLY.has(input.quality)) return { stopped: [], better: [] };
  return { stopped: stoppedGuarding(input), better: whyBetter(input) };
}

function stoppedGuarding(input: BetterMoveInput): string[] {
  const reply = input.evalAfter?.lines[0]?.moveSan;
  return abandonedGuard(input.fenBefore, input.moveSan, reply).flatMap((fact) =>
    fact.kind === 'stopsGuarding' ? [`Your ${PIECE_NAMES[fact.piece]} stopped guarding ${fact.square}, where ${fact.replySan} followed`] : []
  );
}

function whyBetter(input: BetterMoveInput): string[] {
  const best = input.evalBefore.lines[0];
  if (!best || best.moveSan === input.moveSan) return [];
  const fact = betterMoveFacts(input.fenBefore, input.moveSan, best.moveSan).find((each) => each.kind === 'keepsSafe' || each.kind === 'takesOutOfDanger');
  if (!fact) return [];
  const line = settledLine(input.fenBefore, (best.pvSan ?? [best.moveSan]).slice(0, CONFIG.courses.bestLinePlies));
  const what = fact.kind === 'keepsSafe' ? `keeps the ${PIECE_NAMES[fact.piece.piece]} on ${fact.piece.square} safe` : fact.kind === 'takesOutOfDanger' ? `takes the ${PIECE_NAMES[fact.piece.piece]} out of danger on ${fact.piece.square}` : '';
  return [`${best.moveSan} ${what}; after it ${lineBalance(input.fenBefore, line)}`];
}

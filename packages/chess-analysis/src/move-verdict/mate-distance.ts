import type { EngineLine, TacticGainDto } from '@freechesscoach/shared';
import { moverMateIn } from '../mover-mate.js';
import type { PlayerColor } from '../win-probability.js';
import type { VerdictContext } from './context.js';
import type { MoveVerdictCard } from './types.js';

type Card = Omit<MoveVerdictCard, 'detail'>;
type Opportunity = NonNullable<MoveVerdictCard['tacticOpportunity']>;
type Allowed = NonNullable<MoveVerdictCard['tacticAllowed']>;

/**
 * A mate card's distance (`gain.mateIn`): how many moves the mate takes,
 * counting the card's own move as the first, read off the engine line for
 * that move. "They forced mate." said less than the engine knew (the
 * owner's calibration, 2026-10-01: 24…Qxh3, mate in 5 after it).
 *
 * - found: the move was played, so the line is the engine's answer to it
 *   (one move further on), or the move is the mate;
 * - missed: the line of the move the card names, before the move;
 * - allowed: the line of the reply the card names, after the move.
 *
 * A card whose line has no mate score for its side keeps a gain without a
 * distance. The prevention card is left alone: its line is the scan's, from
 * another board than the reader's.
 */
export function withMateDistance(ctx: VerdictContext, card: Card): Card {
  const { tacticOpportunity, tacticAllowed } = card;
  if (tacticOpportunity?.gain?.kind === 'mate') return { ...card, tacticOpportunity: counted(tacticOpportunity, opportunityMateIn(ctx, tacticOpportunity)) };
  if (tacticAllowed?.gain?.kind === 'mate') return { ...card, tacticAllowed: counted(tacticAllowed, allowedMateIn(ctx, tacticAllowed)) };
  return card;
}

function counted<T extends { gain?: TacticGainDto }>(card: T, mateIn: number | null): T {
  return mateIn === null || !card.gain ? card : { ...card, gain: { ...card.gain, mateIn } };
}

function opportunityMateIn(ctx: VerdictContext, card: Opportunity): number | null {
  const { mover, bestLine } = ctx.frame;
  if (card.found) return playedMateIn(ctx);
  return namedMateIn(linesAt(ctx, 0), card.embodiedBySan ?? bestLine.moveSan, mover);
}

function allowedMateIn(ctx: VerdictContext, card: Allowed): number | null {
  const opponent = ctx.frame.mover === 'white' ? 'black' : 'white';
  return namedMateIn(linesAt(ctx, 1), card.byMoveSan, opponent);
}

/** From the move that was played: itself the mate, or one more than the
 * engine needs after it. */
function playedMateIn(ctx: VerdictContext): number | null {
  const { mover, afterLine, playedMates } = ctx.frame;
  if (playedMates) return 1;
  const after = afterLine ? moverMateIn(afterLine, mover) : null;
  return after === null ? null : after + 1;
}

/** The engine's lines before the move (`pliesOn` 0) or after it (1). */
function linesAt(ctx: VerdictContext, pliesOn: 0 | 1): readonly EngineLine[] {
  const { move, evals } = ctx.input;
  return evals[move.ply - 1 + pliesOn]?.lines ?? [];
}

function namedMateIn(lines: readonly EngineLine[], san: string | undefined, side: PlayerColor): number | null {
  const line = lines.find((each) => each.moveSan === san);
  return line ? moverMateIn(line, side) : null;
}

import type { PieceSymbol } from 'chess.js';
import { PIECE_NAMES } from '../piece-names.js';
import { PIECE_VALUES } from '../tactics.js';
import type { LineValue } from './line-value.js';
import type { VerdictReason } from './types.js';

/**
 * The smaller material events on the verdict's own line, which go into the
 * card's detail rather than becoming a second reason: "won a knight, but it
 * cost the queen". `null` when the line only went one way.
 */
export function verdictDetail(reason: VerdictReason, line: LineValue): string | null {
  const net = withoutEvenTrades(line);
  if (reason === 'allowedMate' || reason === 'allowedTactic') return lossDetail(net);
  if (reason === 'defusedThreat') return null;
  return gainDetail(net, reason === 'missedMate' || reason === 'missedTactic');
}

/** A queen for a queen, or a bishop for a knight, is a trade, not "won the
 * queen, giving back a queen": equal-value captures cancel before the line
 * is described. */
function withoutEvenTrades(line: LineValue): LineValue {
  const losses = [...line.losses];
  const gains = line.gains.filter((piece) => {
    const match = losses.findIndex((lost) => PIECE_VALUES[lost] === PIECE_VALUES[piece]);
    if (match === -1) return true;
    losses.splice(match, 1);
    return false;
  });
  return { ...line, gains, losses };
}

/** A move that took something and paid more for it. */
function lossDetail(line: LineValue): string | null {
  if (line.gains.length === 0) return null;
  if (line.mateAgainst) return `won ${listed(line.gains)}, but it allowed mate`;
  const biggest = biggestOf(line.losses);
  return biggest ? `won ${listed(line.gains)}, but it cost the ${PIECE_NAMES[biggest]}` : null;
}

/** A line that won something and gave some of it back. */
function gainDetail(line: LineValue, missed: boolean): string | null {
  const biggest = biggestOf(line.gains);
  if (!biggest || line.losses.length === 0) return null;
  return `${missed ? 'would have won' : 'won'} the ${PIECE_NAMES[biggest]}, giving back ${listed(line.losses)}`;
}

function biggestOf(pieces: readonly PieceSymbol[]): PieceSymbol | null {
  return pieces.reduce<PieceSymbol | null>((top, piece) => (top && PIECE_VALUES[top] >= PIECE_VALUES[piece] ? top : piece), null);
}

function listed(pieces: readonly PieceSymbol[]): string {
  const names = pieces.map((piece) => `a ${PIECE_NAMES[piece]}`);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

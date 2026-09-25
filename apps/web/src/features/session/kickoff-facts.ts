import { plyToMoveRef } from '@freechesscoach/chess-analysis';
import type { ClassificationCounts, GameReport, PlayerColor } from '@freechesscoach/shared';

type ClassifiedMove = GameReport['moves'][number];

/** Qualities that count as a real error the coach will likely talk about. */
const ERROR_QUALITIES = ['blunder', 'mistake', 'miss'] as const;

const ERROR_NOUNS: Record<(typeof ERROR_QUALITIES)[number], [string, string]> = {
  blunder: ['blunder', 'blunders'],
  mistake: ['mistake', 'mistakes'],
  miss: ['missed chance', 'missed chances']
};

function pluralize(count: number, [one, many]: [string, string]): string {
  return `${count} ${count === 1 ? one : many}`;
}

function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1) ?? ''}`;
}

function oppositeColor(color: PlayerColor): PlayerColor {
  return color === 'white' ? 'black' : 'white';
}

/** "17. Nxe5" for White, "17... Nxe5" for Black — how a player reads it. */
export function formatMoveLabel(move: Pick<ClassifiedMove, 'ply' | 'moveSan'>): string {
  const { moveNumber, color } = plyToMoveRef(move.ply);
  return `${moveNumber}${color === 'black' ? '...' : '.'} ${move.moveSan}`;
}

function movesFact(report: GameReport): string | null {
  const fullMoves = Math.ceil(report.moves.length / 2);
  return fullMoves > 0 ? `Went through all ${pluralize(fullMoves, ['move', 'moves'])}` : null;
}

function accuracyFact(report: GameReport, userColor: PlayerColor): string {
  const own = Math.round(report.players[userColor].accuracy);
  const opponent = Math.round(report.players[oppositeColor(userColor)].accuracy);
  return `Your accuracy: ${own}% (opponent ${opponent}%)`;
}

function errorsFact(counts: ClassificationCounts): string {
  const parts = ERROR_QUALITIES.filter((quality) => counts[quality] > 0).map((quality) =>
    pluralize(counts[quality], ERROR_NOUNS[quality])
  );
  return parts.length === 0 ? 'No blunders or mistakes from you' : `Spotted ${joinWithAnd(parts)}`;
}

function highlightsFact(counts: ClassificationCounts): string | null {
  const good = counts.brilliant + counts.great;
  return good > 0 ? `Found ${pluralize(good, ['great move', 'great moves'])} of yours` : null;
}

function isUserError(move: ClassifiedMove): boolean {
  return move.isUserMove && (ERROR_QUALITIES as readonly string[]).includes(move.quality);
}

function turningPointFact(report: GameReport): string | null {
  const worst = report.moves
    .filter(isUserError)
    .reduce<ClassifiedMove | null>((top, move) => (top === null || move.cpLoss > top.cpLoss ? move : top), null);
  return worst ? `Biggest turning point: ${formatMoveLabel(worst)}` : null;
}

function ratingFact(report: GameReport, userColor: PlayerColor): string | null {
  const value = report.players[userColor].estimatedRating.value;
  return value === null ? null : `Played at about ${Math.round(value)} strength`;
}

/** The facts the kickoff loader reveals while the coach plans its first
 * turn — all read from the game report the page already has, so every line
 * is true about this game rather than a generic tip. */
export function buildKickoffFacts(report: GameReport | null | undefined, userColor: PlayerColor): string[] {
  if (!report) return [];
  const counts = report.players[userColor].counts;
  return [
    movesFact(report),
    accuracyFact(report, userColor),
    errorsFact(counts),
    turningPointFact(report),
    highlightsFact(counts),
    ratingFact(report, userColor)
  ].filter((fact): fact is string => fact !== null);
}

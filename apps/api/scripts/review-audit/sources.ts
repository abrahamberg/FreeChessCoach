import type { ReviewTextKind } from '@freechesscoach/chess-analysis';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';

/** `move.reasons` carries only English, so the audit names each reason's
 * builder by its template. This is the audit's own bookkeeping, at the edge:
 * app code never reads it. A reason no template knows is `review:reason:other`
 * and shows up in the report, which is the cue to add its template here. */
const REASON_TEMPLATES: [RegExp, string][] = [
  [/^Missed (mate in \d+|a forced mate) starting with /, 'missed-mate'],
  [/^Missed \S+, winning material on /, 'missed-capture'],
  [/^Leaves the \w+ on [a-h][1-8] undefended$/, 'loose-free'],
  [/^Leaves the \w+ on [a-h][1-8] where it can be won$/, 'loose-winnable'],
  [/^Allows a fork: /, 'allowed-fork'],
  [/^Pins the \w+ on [a-h][1-8] to the (king|queen)$/, 'pin'],
  [/^Attacks the \w+ on [a-h][1-8](, which pins the \w+ on [a-h][1-8])?$/, 'kick'],
  [/stopped guarding [a-h][1-8], where /, 'stopped-guard'],
  [/^\S+ (keeps the \w+ on [a-h][1-8] safe|takes the \w+ out of danger on [a-h][1-8]); after it /, 'better-move'],
  [/^Concedes the centre$/, 'centre'],
  [/^Creates a passed pawn on /, 'passed-pawn'],
  [/^(Recaptures|Trades) /, 'trade'],
  [/^Costs \d+ squares of piece mobility$/, 'mobility']
];

export function reviewSource(kind: ReviewTextKind, text: string, move: ClassifiedMoveDto): string {
  if (kind === 'allowed') return `review:tactic-allowed:${move.tacticAllowed?.type ?? '?'}`;
  if (kind === 'prevention') return `review:tactic-prevention:${move.tacticPrevention?.prevented ? 'stopped' : 'still'}:${move.tacticPrevention?.type ?? '?'}`;
  if (kind === 'opportunity') return `review:tactic-opportunity:${move.tacticOpportunity?.found ? 'found' : 'missed'}:${move.tacticOpportunity?.type ?? '?'}`;
  if (kind === 'opening') return 'review:opening';
  if (kind === 'betterWas') return 'review:better-was';
  return `review:reason:${REASON_TEMPLATES.find(([pattern]) => pattern.test(text))?.[1] ?? 'other'}`;
}

/** Sources whose sentences are a plain description of the move: once the
 * checks pass there is nothing left to judge. */
export const DESCRIPTIVE_SOURCES = new Set([
  'dossier:board:moved',
  'dossier:board:castles',
  'dossier:board:promotes',
  'dossier:board:captures',
  'dossier:board:gives',
  'dossier:board:blocksCheck',
  'dossier:board:discoveredCheck',
  'dossier:board:doubleCheck',
  'dossier:board:checkAnswers',
  'review:opening'
]);

import type { TacticGainDto } from '@freechesscoach/shared';
import type { Color } from 'chess.js';
import { result } from './check-result.js';
import { attackersOf, colorOf, exchangeGain, hasPassedPawnOn, legalCapturesOf, moveIsSound, other, PIECE_BY_NAME, pieceAt, play, playLine, POINTS, settledGain, threatFen } from './oracle.js';
import type { AuditItem, AuditPosition, CheckResult, LineView } from './types.js';

type Check = (item: AuditItem, position: AuditPosition) => CheckResult[];

/** Checks for Game Review's sentences, by source. */
export function checkReviewItem(item: AuditItem, position: AuditPosition): CheckResult[] {
  const family = item.source.split(':').slice(0, 2).join(':');
  const reason = item.source.startsWith('review:reason:') ? REASON_CHECKS[item.source.slice('review:reason:'.length)] : undefined;
  const check = reason ?? FAMILY_CHECKS[family];
  return check ? check(item, position) : [];
}

interface CardData {
  type: string;
  gain?: TacticGainDto;
  byMoveSan?: string;
  threatSan?: string;
  embodiedBySan?: string;
  found?: boolean;
}

const FAMILY_CHECKS: Record<string, Check> = {
  'review:tactic-allowed': (item, position) => {
    const card = item.data as CardData;
    const san = card.byMoveSan;
    if (!san) return [result('named-move', false, 'the card names no reply')];
    const taker = other(colorOf(position.mover));
    return [result('named-move', play(position.fenAfter, san) !== null, `${san} is not legal after the move`), ...gainChecks(card.gain, position.fenAfter, position.linesAfter, san, taker)];
  },
  // The threat a prevention card names is the opponent's move on the board
  // before this one: a card that names none, or one that is not legal
  // there, describes a board the reader cannot reach.
  'review:tactic-prevention': (item, position) => {
    const san = (item.data as CardData).threatSan;
    if (!san) return [result('named-move', false, 'the card names no threat move')];
    return [result('named-move', threatFen(position.fenBefore, san) !== null, `${san} is not the opponent's legal move before this one`)];
  },
  'review:tactic-opportunity': (item, position) => {
    const card = item.data as CardData;
    const san = card.embodiedBySan ?? position.linesBefore[0]?.san;
    if (!san) return [];
    return [result('named-move', play(position.fenBefore, san) !== null, `${san} is not legal before the move`), ...gainChecks(card.gain, position.fenBefore, position.linesBefore, san, colorOf(position.mover))];
  },
  'review:better-was': (item, position) => {
    const line = item.text.replace(/^.*better was /, '').split(' ');
    return [result('named-line', playLine(position.fenBefore, line).legal, `${line.join(' ')} is not legal from the position`)];
  }
};

/** A card that promises material or mate: the engine's own line for the
 * named move has to deliver it. A line that ends before the prize falls is
 * the "tactic that happens later, in a line nobody showed" failure. */
function gainChecks(gain: TacticGainDto | undefined, fen: string, lines: LineView[], san: string, side: Color): CheckResult[] {
  if (!gain || (gain.kind !== 'material' && gain.kind !== 'mate')) return [];
  const line = lines.find((each) => each.san === san);
  if (!line) return [result('engine-line', false, `${san} is not among the engine's ${lines.length} lines`)];
  if (gain.kind === 'mate') {
    const mates = line.mate !== null && (side === 'w' ? line.mate > 0 : line.mate < 0);
    return [result('mate-in-line', mates, `the engine's line for ${san} is ${line.mate === null ? `cp ${line.cp ?? '?'}` : `mate ${line.mate}`}, not a mate for this side`)];
  }
  const prize = gain.prize ? (POINTS[PIECE_BY_NAME[gain.prize] ?? 'p'] ?? 0) : 0;
  const claimed = Math.max(1, Math.min(gain.pawns, prize || gain.pawns));
  const won = settledGain(fen, line.pv, side);
  return [result('material-in-line', won >= claimed - 1, `claims ${gain.prize ?? `${gain.pawns} pawns`}; the engine line ${line.pv.join(' ')} wins ${won}`), soundMove(lines, san, side)];
}

function soundMove(lines: LineView[], san: string, side: Color): CheckResult {
  return result('named-move-sound', moveIsSound(lines, san, side), `${san} is not a move the engine would play: its line is ${evalWords(lines.find((line) => line.san === san))}, the best (${lines[0]?.san}) ${evalWords(lines[0])}`);
}

function evalWords(line: LineView | undefined): string {
  if (!line) return '?';
  return line.mate !== null ? `mate ${line.mate}` : ((line.cp ?? 0) / 100).toFixed(2);
}

const SQUARE = /\bon ([a-h][1-8])\b/;

const REASON_CHECKS: Record<string, Check> = {
  'loose-free': (item, position) => {
    const square = SQUARE.exec(item.text)?.[1] ?? '';
    const own = colorOf(position.mover);
    const piece = pieceAt(position.fenAfter, square);
    const takers = legalCapturesOf(position.fenAfter, square, other(own));
    const defenders = attackersOf(position.fenAfter, square, own);
    return [
      result('own-piece', piece?.color === own, `no ${position.mover} piece on ${square}`),
      result('can-be-taken', takers.length > 0, `nothing can legally take on ${square}`),
      result('undefended', defenders.length === 0, `defended from ${defenders.join(', ')}`),
      result('can-be-won', exchangeGain(position.fenAfter, square, other(own)) > 0, `taking on ${square} wins nothing over the exchange`)
    ];
  },
  'loose-winnable': (item, position) => {
    const square = SQUARE.exec(item.text)?.[1] ?? '';
    const own = colorOf(position.mover);
    return [
      result('own-piece', pieceAt(position.fenAfter, square)?.color === own, `no ${position.mover} piece on ${square}`),
      result('can-be-taken', legalCapturesOf(position.fenAfter, square, other(own)).length > 0, `nothing can legally take on ${square}`),
      result('can-be-won', exchangeGain(position.fenAfter, square, other(own)) > 0, `taking on ${square} wins nothing over the exchange (${exchangeGain(position.fenAfter, square, other(own))})`)
    ];
  },
  'allowed-fork': (item, position) => {
    const squares = [...item.text.matchAll(/ on ([a-h][1-8])/g)].map((match) => match[1] ?? '');
    const [forker, ...targets] = squares;
    const them = other(colorOf(position.mover));
    const misses = targets.filter((target) => !attackersOf(position.fenAfter, target, them).includes((forker ?? '') as never));
    return [result('fork-geometry', pieceAt(position.fenAfter, forker ?? '')?.color === them && misses.length === 0, `the piece on ${forker} does not hit ${misses.join(', ') || 'its targets'}`)];
  },
  'missed-capture': (item, position) => {
    const san = /^Missed (\S+),/.exec(item.text)?.[1] ?? '';
    const line = position.linesBefore.find((each) => each.san === san);
    const won = line ? settledGain(position.fenBefore, line.pv, colorOf(position.mover)) : 0;
    return [result('material-in-line', won >= 1, `the engine line ${line?.pv.join(' ') ?? '(none)'} wins ${won}`), soundMove(position.linesBefore, san, colorOf(position.mover))];
  },
  'missed-mate': (item, position) => {
    const san = /starting with (\S+)$/.exec(item.text)?.[1] ?? '';
    const moves = Number(/mate in (\d+)/.exec(item.text)?.[1]);
    const line = position.linesBefore.find((each) => each.san === san);
    return [result('mate-in-line', line?.mate !== null && Math.abs(line?.mate ?? 0) === moves, `the engine line for ${san} is ${line?.mate ?? 'no mate'}`)];
  },
  'stopped-guard': (item, position) => {
    const match = /stopped guarding ([a-h][1-8]), where (\S+) followed/.exec(item.text);
    const square = match?.[1] ?? '';
    const reply = match?.[2] ?? '';
    const own = colorOf(position.mover);
    const guardedBefore = attackersOf(position.fenBefore, square, own).length;
    const guardedAfter = attackersOf(position.fenAfter, square, own).length;
    const lands = play(position.fenAfter, reply) !== null && reply.replace(/[+#=QRBN]+$/, '').endsWith(square);
    return [result('guard-lost', guardedAfter < guardedBefore, `${square} is guarded ${guardedBefore}× before and ${guardedAfter}× after`), result('reply-lands', lands, `${reply} does not land on ${square}`)];
  },
  'passed-pawn': (item, position) => {
    const file = /passed pawn on ([a-h])/.exec(item.text)?.[1] ?? '';
    const side = colorOf(position.mover);
    return [
      result('passed-pawn', hasPassedPawnOn(position.fenAfter, file, side), `no ${position.mover} passed pawn on the ${file}-file`),
      result('passed-pawn-new', !hasPassedPawnOn(position.fenBefore, file, side), `the ${file}-pawn was already passed before the move`)
    ];
  }
};

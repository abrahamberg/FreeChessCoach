import { isImprovableQuality, type ClassifiedMoveDto } from '@freechesscoach/shared';
import { tacticAllowedReason, tacticOpportunityReason, tacticPreventionReason } from './tactic-reason-text.js';
import { orderTacticCards, type TacticCardKind } from './tactic-card-order.js';

/** The sentence of each tactic card a move carries. `isUserMove` decides
 * "You" vs "They" and lives on the move rather than on either card. */
export function tacticCardTexts(move: ClassifiedMoveDto): Record<TacticCardKind, string | null> {
  return {
    allowed: move.tacticAllowed ? tacticAllowedReason({ ...move.tacticAllowed, isUserMove: move.isUserMove }) : null,
    prevention: move.tacticPrevention ? tacticPreventionReason({ ...move.tacticPrevention, isUserMove: move.isUserMove }) : null,
    opportunity: move.tacticOpportunity ? tacticOpportunityReason({ ...move.tacticOpportunity, isUserMove: move.isUserMove }, move.bestMoveSan) : null
  };
}

/** `move.reasons` minus the baked-in copies of the tactic card sentences,
 * when the card sentences are shown on their own (Game Review). */
export function plainReviewReasons(move: ClassifiedMoveDto, excludeTacticText: boolean): string[] {
  if (!move.reasons || move.reasons.length === 0) return [];
  if (!excludeTacticText) return move.reasons;
  const cardTexts = new Set(Object.values(tacticCardTexts(move)).filter((text): text is string => text !== null));
  return move.reasons.filter((reason) => !cardTexts.has(reason));
}

/** "mistake: better was Nc3", shown when a costly move has no other note. */
export function betterWasText(move: ClassifiedMoveDto, excludeTacticText: boolean): string | null {
  if (move.quality === 'book' || plainReviewReasons(move, excludeTacticText).length > 0) return null;
  if (!isImprovableQuality(move.quality) || move.bestLineSan.length === 0) return null;
  return `${move.quality}: better was ${move.bestLineSan.join(' ')}`;
}

export type ReviewTextKind = TacticCardKind | 'opening' | 'reason' | 'betterWas';

/** Every sentence Game Review's note card shows for a move, in order. */
export function reviewMoveTexts(move: ClassifiedMoveDto): { kind: ReviewTextKind; text: string }[] {
  const cards = tacticCardTexts(move);
  const texts: { kind: ReviewTextKind; text: string }[] = orderTacticCards().flatMap((kind) => {
    const text = cards[kind];
    return text ? [{ kind, text }] : [];
  });
  if (move.quality === 'book') {
    const theory = move.reasons?.[0];
    return theory ? [...texts, { kind: 'opening', text: theory }] : texts;
  }
  texts.push(...plainReviewReasons(move, true).map((text) => ({ kind: 'reason' as const, text })));
  const better = betterWasText(move, true);
  if (better) texts.push({ kind: 'betterWas', text: better });
  return texts;
}

/** Game Review's sentences for a move, sorted by who they are about, for the
 * coach: what the move that was played did well or badly, and what the best
 * move had that it did not. A missed tactic is the best move's merit; a found
 * one is the played move's. */
export interface CoachReviewTexts {
  aboutMove: string[];
  bestWasBetter: string[];
}

export function coachReviewTexts(move: ClassifiedMoveDto): CoachReviewTexts {
  const texts: CoachReviewTexts = { aboutMove: [], bestWasBetter: [] };
  for (const { kind, text } of reviewMoveTexts(move)) {
    const aboutBest = kind === 'betterWas' || (kind === 'opportunity' && move.tacticOpportunity?.found === false);
    (aboutBest ? texts.bestWasBetter : texts.aboutMove).push(text);
  }
  return texts;
}

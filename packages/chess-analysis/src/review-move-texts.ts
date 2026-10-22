import { capitalise, isImprovableQuality, type ClassifiedMoveDto } from '@freechesscoach/shared';
import { CONFIG } from './config.js';
import { hasDecisiveNote } from './decisive-notes.js';
import { FAULT_KINDS, POINT_KINDS } from './move-reason-ideas.js';
import { renderMoveIdea, type MoveIdea } from './move-ideas/index.js';
import type { MoveStory } from './move-story.js';
import { alternativeText } from './move-story-text.js';
import { tacticAllowedReason, tacticOpportunityReason, tacticPreventionReason } from './tactic-reason-text.js';
import { orderTacticCards, type TacticCardKind } from './tactic-card-order.js';

/** The story stored with a move, or null for a move analysed before stories. */
export function storyOf(move: Pick<ClassifiedMoveDto, 'story'>): MoveStory | null {
  return (move.story as MoveStory | undefined) ?? null;
}

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

/** `idea`: what the move does; `better`: the engine's move on a costly one,
 * with what it does; `alternative`: the engine's other moves. */
export type ReviewTextKind = TacticCardKind | 'opening' | 'reason' | 'betterWas' | 'idea' | 'better' | 'alternative';

export interface ReviewText {
  kind: ReviewTextKind;
  text: string;
  /** Shown under "more", not in the note itself. */
  more?: boolean;
}

/** Every sentence Game Review's note card shows for a move, in order: from
 * the move's story when it has one (`move-story.ts`), else from the
 * sentences stored before stories. */
export function reviewMoveTexts(move: ClassifiedMoveDto): ReviewText[] {
  const cards = tacticCardTexts(move);
  const texts: ReviewText[] = orderTacticCards().flatMap((kind) => {
    const text = cards[kind];
    return text ? [{ kind, text }] : [];
  });
  const story = storyOf(move);
  if (story) return [...texts, ...storyTexts(move, story)];
  if (move.quality === 'book') {
    // The theory line, then what the book move does (`move-ideas/`).
    const [theory, ...ideas] = move.reasons ?? [];
    return theory ? [...texts, { kind: 'opening', text: theory }, ...ideas.map((text) => ({ kind: 'reason' as const, text }))] : texts;
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
  for (const { kind, text, more } of reviewMoveTexts(move)) {
    if (more) continue;
    const aboutBest = kind === 'betterWas' || kind === 'better' || (kind === 'opportunity' && move.tacticOpportunity?.found === false);
    (aboutBest ? texts.bestWasBetter : texts.aboutMove).push(text);
  }
  return texts;
}

/**
 * The player's review from the story: the notes (what went right or wrong),
 * then what the move does, then — on a costly move — the engine's move with
 * what it does, then the engine's other moves. The note shows the faults
 * and the most telling ideas; the rest is under "more". The words are the
 * dossier's (`dossier-text.ts`), so what the page shows is what the course
 * writer was told.
 */
function storyTexts(move: ClassifiedMoveDto, story: MoveStory): ReviewText[] {
  const texts: ReviewText[] = [];
  const theory = move.quality === 'book' ? move.reasons?.[0] : undefined;
  if (theory) texts.push({ kind: 'opening', text: theory });
  texts.push(...story.notes.map((text): ReviewText => ({ kind: 'reason', text })));
  const costly = isImprovableQuality(move.quality);
  const ideas = story.ideas.filter((idea) => !saidByNotes(idea, story.notes));
  // On a costly move the fault is the story (Tasks 126.2–3): one fault idea
  // in the note (none beside a lost piece or a mate allowed), and its point
  // only on a small fault.
  const small = move.quality === 'inaccuracy' || move.quality === 'miss';
  const faultRoom = hasDecisiveNote(move) ? 0 : CONFIG.moveReasons.maxFaultIdeas;
  let shown = 0;
  let faults = 0;
  for (const idea of ideas) {
    let inNote: boolean;
    if (!costly) inNote = shown < CONFIG.moveReasons.maxIdeas;
    else if (FAULT_KINDS.has(idea.kind)) inNote = faults++ < faultRoom;
    else inNote = small && POINT_KINDS.has(idea.kind) && shown === 0;
    if (inNote) shown += 1;
    texts.push({ kind: 'idea', text: capitalise(renderMoveIdea(idea)), more: !inNote });
  }
  const best = costly && story.bestInstead ? story.alternatives.find((alt) => alt.san === story.bestInstead?.san) : undefined;
  if (best) texts.push({ kind: 'better', text: alternativeText(best), more: story.notes.some((note) => note.includes(best.san)) });
  else if (costly && story.notes.length === 0 && move.bestLineSan.length) texts.push({ kind: 'betterWas', text: `${move.quality}: better was ${move.bestLineSan.join(' ')}` });
  for (const alt of story.alternatives) if (alt !== best) texts.push({ kind: 'alternative', text: alternativeText(alt), more: true });
  return texts;
}

/** An idea a note already says: the piece taken back ("Recaptures the
 * knight"), the passed pawn made, castling given up. */
function saidByNotes(idea: MoveIdea, notes: readonly string[]): boolean {
  if (idea.kind === 'saves') return notes.some((note) => /^(Recaptures|Trades) /.test(note));
  if (idea.kind === 'passedPawn') return notes.some((note) => note.startsWith('Creates a passed pawn'));
  if (idea.kind === 'losesCastling') return notes.some((note) => note.includes('gives up castling'));
  return false;
}

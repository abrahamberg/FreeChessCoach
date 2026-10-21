import { isMate } from '../fast-board/moves.js';
import { centreIdeas } from './centre.js';
import { ideaContext, type MoveIdeasInput } from './context.js';
import { defenceIdeas } from './defence.js';
import { developmentIdeas } from './development.js';
import { kingIdeas } from './king.js';
import { lineIdeas } from './lines.js';
import { materialIdeas } from './material.js';
import { planIdeas } from './plans.js';
import { structureIdeas } from './structure.js';
import { threatIdeas } from './threats.js';
import { tradeIdeas } from './trades.js';
import type { MoveIdea, MoveIdeaKind } from './types.js';

export type { MoveIdea, MoveIdeaKind, PreventedBecause, Wing } from './types.js';
export type { MoveIdeasInput } from './context.js';
export { movesOfLine } from './context.js';
export { renderMoveIdea } from './render.js';

/** Most telling first: what the move threatens or stops, then the king,
 * then development, the centre, the lines, the pawns, trades and plans. */
const ORDER: MoveIdeaKind[] = [
  'threatensMate', 'stopsMate', 'sacrifices', 'threatensMaterial', 'saves', 'pins', 'keepsPin', 'leavesPinned', 'pinnedCannotTake', 'removesDefender', 'prevents', 'kicks', 'pilesOn', 'restricts', 'unpins',
  'breaksShield', 'weakensShield', 'joinsAttack', 'guardsKing', 'takesFlightSquare', 'leavesKing', 'occupiesHole', 'stopsCastling', 'flightSquare', 'losesCastling', 'activatesKing',
  'castles', 'develops', 'movesAgain', 'earlyQueen', 'blocksPawn', 'takesKnightSquare', 'developmentLead',
  'occupiesCentre', 'strikesCentre', 'controlsCentre', 'supportsCentre', 'centralises', 'givesUpCentre', 'gainsSpace',
  'aimsAt', 'battery', 'longDiagonal', 'fianchetto', 'rookFile', 'opensFile', 'doubles', 'seventhRank', 'rookToCentre', 'connectsRooks', 'opensLine', 'shutsIn', 'opensEnemyLine',
  'outpost', 'blockades', 'passedPawn', 'fixesPawn', 'majority', 'pawnStorm', 'pawnWeakness', 'forcesWeakness',
  'defends', 'clearsCastling',
  'materialBalance', 'tradesWhenAhead', 'bishopPair', 'recapturesTowardCentre', 'prepares', 'preparesPush', 'preparesFianchetto', 'eyesOutpost'
];

/** `full`: everything, for the move that was played. `does`: what a move
 * does by itself (develops, blocks, pins, threatens), for the moves that
 * were not played: about a quarter of the time. */
export type IdeaScope = 'full' | 'does';

/**
 * Why a move was played, as checked data: what it threatens and stops, what
 * it does for development, the centre, the lines, the king and the pawns,
 * and what it prepares on the engine's line. Pure: board facts and the
 * engine's evaluation after the move, never English.
 */
export function moveIdeas(input: MoveIdeasInput, scope: IdeaScope = 'full'): MoveIdea[] {
  const key = ideasKey(input, scope);
  const known = IDEAS_CACHE.get(key);
  if (known) return known;
  const ideas = computeIdeas(input, scope);
  if (IDEAS_CACHE.size >= IDEAS_CACHE_LIMIT) IDEAS_CACHE.delete(IDEAS_CACHE.keys().next().value as string);
  IDEAS_CACHE.set(key, ideas);
  return ideas;
}

/** The review and the course dossier ask about the same moves: the answer
 * is a pure function of everything in the key. */
const IDEAS_CACHE = new Map<string, MoveIdea[]>();
const IDEAS_CACHE_LIMIT = 2048;

function ideasKey(input: MoveIdeasInput, scope: IdeaScope): string {
  const line = (evaluation: MoveIdeasInput['evalAfter']): string => {
    const first = evaluation?.lines[0];
    return first ? `${first.cp ?? ''}/${first.mateIn ?? ''}/${(first.pvSan ?? []).slice(0, 2).join(' ')}` : '';
  };
  return [scope, input.fenBefore, input.san, input.previous.map((move) => move.san).join(' '), line(input.evalBefore), line(input.evalAfter)].join('|');
}

function computeIdeas(input: MoveIdeasInput, scope: IdeaScope): MoveIdea[] {
  const context = ideaContext(input);
  // A mate is the whole description (the owner's rule for the dossier's alternatives too).
  if (!context || isMate(context.fast.after)) return [];
  const full = scope === 'full';
  const ideas = [
    ...threatIdeas(context),
    ...(full ? defenceIdeas(context) : []),
    ...(full ? kingIdeas(context) : []),
    ...developmentIdeas(context),
    ...centreIdeas(context),
    ...lineIdeas(context),
    ...structureIdeas(context),
    ...(full ? materialIdeas(context) : []),
    ...tradeIdeas(context),
    ...(full ? planIdeas(context) : [])
  ];
  return withoutRepeats(ideas).sort((a, b) => rank(a) - rank(b));
}

/** A prevented check, pin or attack ranks with the threats; a prevented
 * pawn advance or developing move after the centre ideas. */
function rank(idea: MoveIdea): number {
  if (idea.kind === 'prevents' && idea.because !== 'check' && idea.because !== 'pin' && idea.because !== 'attack') return ORDER.indexOf('givesUpCentre') + 0.5;
  return ORDER.indexOf(idea.kind);
}

/** One idea per target: a piece the move threatens to win is not also
 * "attacked a third time", a pawn's kick says the threat itself ("attacks
 * the bishop on g5, which pins the knight"), and a piece saved is not also
 * "defended". */
function withoutRepeats(ideas: MoveIdea[]): MoveIdea[] {
  const kicked = new Set(ideas.flatMap((idea) => (idea.kind === 'kicks' ? [idea.target.square] : [])));
  const threatened = new Set(ideas.flatMap((idea) => (idea.kind === 'threatensMaterial' ? [idea.target.square] : [])));
  const saved = new Set(ideas.flatMap((idea) => (idea.kind === 'saves' ? [idea.piece.square] : [])));
  return ideas.filter((idea) => {
    if (idea.kind === 'threatensMaterial' && kicked.has(idea.target.square)) return false;
    if (idea.kind === 'pilesOn' && threatened.has(idea.target.square)) return false;
    if (idea.kind === 'defends' && saved.has(idea.piece.square)) return false;
    return true;
  });
}

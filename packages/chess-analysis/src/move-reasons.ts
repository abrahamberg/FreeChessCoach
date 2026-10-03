import { Chess, type Move, type Square } from 'chess.js';
import { isImprovableQuality, type EngineEval, type FeatureDeltaDto, type MoveQuality, type PositionFeatures } from '@freechesscoach/shared';
import { betterMoveReasons } from './move-reason-better.js';
import { kickReason } from './kick-reason.js';
import { onlyMoveReason } from './only-move-reason.js';
import { pinReason } from './pin-reason.js';
import { saidMateIn } from './mate-count.js';
import { moverMateIn } from './mover-mate.js';
import { loosePieces } from './board-facts/loose-pieces.js';
import { quietLineGain } from './board-facts/material.js';
import { PIECE_VALUES } from './tactics.js';
import { PIECE_NAMES } from './piece-names.js';
import { describeTrade } from './trade-description.js';
import { see } from './see.js';
import { createdPassedPawns } from './pawn-structure.js';
import { CONFIG } from './config.js';
import { flipActiveColorFen } from './null-move-fen.js';
import { allowedForkReasons, gainReasons, missedForkReasons } from './fork-reasons.js';
import { stalemateReason } from './stalemate-reason.js';

export interface MoveReasonsInput {
  mover: 'white' | 'black';
  fenBefore: string;
  fenAfter: string;
  moveSan: string;
  evalBefore: EngineEval;
  /** This move's own classification. Fault-finding reasons are for moves
   * that actually cost something — see `mobilityReason`. */
  quality?: MoveQuality;
  /** The reader played this move (costly ones get the why-it-was-better notes). */
  isUserMove?: boolean;
  /** The engine's view after the move: its reply is what a stopped guard is named against. */
  evalAfter?: EngineEval;
  /** The opponent's previous move captured on this square. */
  isRecapture?: boolean;
  isBookMove: boolean;
  openingName?: string | null;
  eco?: string | null;
  featureDelta?: FeatureDeltaDto;
  featuresBefore?: PositionFeatures;
  featuresAfter?: PositionFeatures;
}

type ReasonCategory = 'mate' | 'material' | 'tactical' | 'structural' | 'trade' | 'mobility';
interface Reason {
  category: ReasonCategory;
  text: string;
}

const {
  maxReasons: MAX_REASONS,
  centerSwingThreshold: CENTER_SWING_THRESHOLD,
  mobilityDropThreshold: MOBILITY_DROP_THRESHOLD
} = CONFIG.moveReasons;
const { minThreatSeeCp: MIN_THREAT_SEE_CP } = CONFIG.evalWitness;
const CATEGORY_ORDER: ReasonCategory[] = ['mate', 'material', 'tactical', 'structural', 'trade', 'mobility'];

/** §11's deterministic per-move coaching reasons — no LLM at render time. */
export function buildReasons(input: MoveReasonsInput): string[] {
  if (input.isBookMove) return [bookReason(input)];
  const stalemate = stalemateReason(input.fenAfter, input.mover, input.evalBefore);
  if (stalemate) return [stalemate];

  const missed = [...missedMateReason(input), ...missedCaptureReason(input)];
  const reasons = [
    ...missed,
    ...(missed.length ? [] : missedForkReasons(input, isFault(input))),
    ...looseReasons(input),
    ...allowedForkReasons(input, isFault(input)),
    ...costlyMoveReasons(input),
    ...gainReasons(input, isFault(input)),
    ...centerSwingReason(input),
    ...passedPawnReasons(input),
    // Last in CATEGORY_ORDER before mobility, so naming the exchange never
    // pushes out a fault — it fills the note on the ordinary trade that has
    // no fault to report, which is most of them.
    ...tradeReason(input)
  ];
  const note = cardReplaceableNote(input, reasons);
  // Mobility is the weakest signal here (a bad move usually has a sharper
  // reason than "fewer squares") — it only earns a mention when nothing
  // better already explains the move, never alongside one.
  if (reasons.length === 0 && !note) reasons.push(...mobilityReason(input));

  const kept = reasons
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
    .slice(0, MAX_REASONS)
    .map((reason) => reason.text);
  return note && kept.length < MAX_REASONS ? [...kept, note] : kept;
}

/**
 * The one note a tactic card may replace later: the only move
 * (`only-move-reason.ts`), else the pin the move made (`pin-reason.ts`),
 * else the piece its pawn attacks (`kick-reason.ts`).
 *
 * The cards are decided after the reasons (`report-tactic-verdicts.ts`),
 * and a card for the same thing drops the note. So the note only ever fills
 * a free slot: had it pushed another reason out first, that reason would be
 * gone for nothing (6…exf2+ lost "Trades pawns on f2" that way).
 */
function cardReplaceableNote(input: MoveReasonsInput, others: readonly Reason[]): string | null {
  return onlyMoveNote(input, others) ?? quietMoveNote(input);
}

function bookReason(input: MoveReasonsInput): string {
  if (!input.openingName) return 'Theory — known opening move';
  return input.eco ? `Theory — ${input.openingName} (${input.eco})` : `Theory — ${input.openingName}`;
}

function missedMateReason(input: MoveReasonsInput): Reason[] {
  const best = input.evalBefore.lines[0];
  if (!best || best.moveSan === input.moveSan) return [];
  if (moverMateIn(best, input.mover) === null) return [];
  // A slower mate is still the win: "Missed a forced mate" on Rd1+, which
  // mates in 5 where Qd6+ mates in 4, hides that nothing was lost.
  const after = input.evalAfter?.lines[0];
  if (after && moverMateIn(after, input.mover) !== null) return [];
  const mateIn = saidMateIn(best, input.evalBefore);
  return [{ category: 'mate', text: `Missed ${mateIn === null ? 'a forced mate' : `mate in ${mateIn}`} starting with ${best.moveSan}` }];
}

/** The engine's first move took something and came out ahead: by a pawn's
 * worth on the square (a knight for a bishop is ten points on `see.ts`'s
 * scale and wins nothing), and still ahead where its own line goes quiet
 * (…Nxd7 in the Opera game takes a rook and Bxe7 takes the queen). */
function missedCaptureReason(input: MoveReasonsInput): Reason[] {
  const best = input.evalBefore.lines[0];
  if (!best || best.moveSan === input.moveSan) return [];

  const chess = new Chess(input.fenBefore);
  let move;
  try {
    move = chess.move(best.moveSan);
  } catch {
    return [];
  }
  if (!move.captured) return [];

  const side = input.mover === 'white' ? 'w' : 'b';
  if (see(input.fenBefore, move.to as Square, side) < MIN_THREAT_SEE_CP) return [];
  if (best.pvSan?.length && quietLineGain(input.fenBefore, best.pvSan) <= 0) return [];
  return [{ category: 'material', text: `Missed ${best.moveSan}, winning material on ${move.to}` }];
}

/** Fault notes are for moves that cost something. */
const isFault = (input: MoveReasonsInput): boolean => isImprovableQuality(input.quality);

/** Pieces the move leaves the other side able to win, from the board facts
 * (`board-facts/loose-pieces.ts`): "undefended" for a free piece, "where it
 * can be won" for a defended one the exchange still loses. Only what the move
 * made loose, and never the piece that just took on a trade (an even
 * capture taken back is an exchange, not a hung piece). */
function looseReasons(input: MoveReasonsInput): Reason[] {
  if (!isFault(input)) return [];
  const owner = input.mover === 'white' ? 'w' : 'b';
  const before = new Map(loosePieces(input.fenBefore, owner).map((piece) => [piece.square, piece.tier]));
  const traded = tradedSquare(input);
  return loosePieces(input.fenAfter, owner)
    .filter((piece) => piece.square !== traded && (before.get(piece.square) === undefined || (before.get(piece.square) === 'winnable' && piece.tier === 'free')))
    .map((piece) => ({
      category: 'material',
      text: `Leaves the ${PIECE_NAMES[piece.piece]} on ${piece.square} ${piece.tier === 'free' ? 'undefended' : 'where it can be won'}`
    }));
}

/** The square the move captured on, when what it took was worth at least
 * what took it. */
function tradedSquare(input: MoveReasonsInput): string | null {
  const move = playedMove(input);
  return move?.captured && PIECE_VALUES[move.captured] >= PIECE_VALUES[move.piece] ? move.to : null;
}

/** The one move that works, played or missed. Not on a recapture (taking
 * back is the only move by definition), and not when a sharper note already
 * names the move that was missed. */
function onlyMoveNote(input: MoveReasonsInput, others: readonly Reason[]): string | null {
  if (input.isRecapture) return null;
  const text = onlyMoveReason(input);
  const best = input.evalBefore.lines[0]?.moveSan;
  const named = best !== undefined && best !== input.moveSan && others.some((reason) => reason.text.includes(best));
  return named ? null : text;
}

/** What a quiet move does to the other side's pieces: the pin first, else
 * the kick. Not on a move that cost something: there the fault is the
 * story, and on an inaccuracy with nothing else to say the note is "better
 * was …", which a pin or a kick would push out. */
function quietMoveNote(input: MoveReasonsInput): string | null {
  if (isFault(input)) return null;
  return pinReason(input.fenBefore, input.moveSan, input.mover) ?? kickReason(input.fenBefore, input.moveSan);
}

/** What the move gave up, and why the engine's move was better. */
function costlyMoveReasons(input: MoveReasonsInput): Reason[] {
  const { stopped, better } = betterMoveReasons({ ...input, isUserMove: input.isUserMove === true });
  return [...stopped.map((text): Reason => ({ category: 'tactical', text })), ...better.map((text): Reason => ({ category: 'material', text }))];
}

function centerSwingReason(input: MoveReasonsInput): Reason[] {
  const before = input.featuresBefore?.centerControlScore;
  const after = input.featuresAfter?.centerControlScore;
  if (!before || !after) return [];

  const opponent = input.mover === 'white' ? 'black' : 'white';
  const swing = (after[opponent] - after[input.mover]) - (before[opponent] - before[input.mover]);
  if (swing < CENTER_SWING_THRESHOLD) return [];
  return [{ category: 'structural', text: 'Concedes the centre' }];
}

/** Only a pawn the move made passed: one that was passed already and is
 * pushed creates nothing (`createdPassedPawns`). */
function passedPawnReasons(input: MoveReasonsInput): Reason[] {
  if (!input.featuresBefore || !input.featuresAfter) return [];
  const move = playedMove(input);
  if (!move) return [];
  return createdPassedPawns(input.featuresBefore.passedPawns, input.featuresAfter.passedPawns, move).map((square) => ({
    category: 'structural',
    text: `Creates a passed pawn on ${square[0]}`
  }));
}

function playedMove(input: MoveReasonsInput): Move | null {
  try {
    return new Chess(input.fenBefore).move(input.moveSan);
  } catch {
    return null;
  }
}

/**
 * Only ever a fault, so only ever on a move that was one. A natural retake
 * gives up squares by definition — the piece is now standing where the
 * exchange happened — and "Costs 8 squares of piece mobility" was the entire
 * note on a best-move recapture, which reads as a criticism of the only
 * sensible move on the board.
 */
function mobilityReason(input: MoveReasonsInput): Reason[] {
  if (!isImprovableQuality(input.quality)) return [];
  const delta = moverMobilityDelta(input);
  if (delta === null || delta > MOBILITY_DROP_THRESHOLD) return [];
  return [{ category: 'mobility', text: `Costs ${Math.abs(delta)} squares of piece mobility` }];
}

/** The mover's legal moves after the move (were it to move again) less its
 * legal moves before. `featureDelta.mobilityDelta` is not this: it takes the
 * mover's moves before from the opponent's moves after, and "Costs 22
 * squares" was 51 Black moves against 29 White ones while Black's own went
 * from 51 to 47. Null when the move gives check: there is no "again". */
function moverMobilityDelta(input: MoveReasonsInput): number | null {
  const again = flipActiveColorFen(input.fenAfter);
  if (!again) return null;
  try {
    return new Chess(again).moves().length - new Chess(input.fenBefore).moves().length;
  } catch {
    return null;
  }
}

/** "Recaptures the knight on d4" / "Trades bishops on c6" — see
 * `trade-description.ts` for which exchanges earn a sentence. */
function tradeReason(input: MoveReasonsInput): Reason[] {
  const text = describeTrade({
    fenBefore: input.fenBefore,
    moveSan: input.moveSan,
    isRecapture: input.isRecapture === true,
    replySan: input.evalAfter?.lines[0]?.moveSan
  });
  return text ? [{ category: 'trade', text }] : [];
}

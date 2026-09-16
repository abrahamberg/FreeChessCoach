import { Chess, type Square } from 'chess.js';
import { isImprovableQuality, type EngineEval, type FeatureDeltaDto, type MoveQuality, type PositionFeatures } from '@freechesscoach/shared';
import { toColorName } from './attack-map.js';
import { PIECE_NAMES } from './piece-names.js';
import { describeTrade } from './trade-description.js';
import { see } from './see.js';
import { CONFIG } from './config.js';

export interface MoveReasonsInput {
  mover: 'white' | 'black';
  fenBefore: string;
  fenAfter: string;
  moveSan: string;
  evalBefore: EngineEval;
  /** This move's own classification. Fault-finding reasons are for moves
   * that actually cost something — see `mobilityReason`. */
  quality?: MoveQuality;
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
const CATEGORY_ORDER: ReasonCategory[] = ['mate', 'material', 'tactical', 'structural', 'trade', 'mobility'];

/** §11's deterministic per-move coaching reasons — no LLM at render time. */
export function buildReasons(input: MoveReasonsInput): string[] {
  if (input.isBookMove) return [bookReason(input)];

  const reasons = [
    ...missedMateReason(input),
    ...missedCaptureReason(input),
    ...hangingPieceReasons(input),
    ...newForkReasons(input),
    ...underDefendedReasons(input),
    ...centerSwingReason(input),
    ...passedPawnReasons(input),
    // Last in CATEGORY_ORDER before mobility, so naming the exchange never
    // pushes out a fault — it fills the note on the ordinary trade that has
    // no fault to report, which is most of them.
    ...tradeReason(input)
  ];
  // Mobility is the weakest signal here (a bad move usually has a sharper
  // reason than "fewer squares") — it only earns a mention when nothing
  // better already explains the move, never alongside one.
  if (reasons.length === 0) reasons.push(...mobilityReason(input));

  return reasons
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
    .slice(0, MAX_REASONS)
    .map((reason) => reason.text);
}

function bookReason(input: MoveReasonsInput): string {
  if (!input.openingName) return 'Theory — known opening move';
  return input.eco ? `Theory — ${input.openingName} (${input.eco})` : `Theory — ${input.openingName}`;
}

function missedMateReason(input: MoveReasonsInput): Reason[] {
  const best = input.evalBefore.lines[0];
  if (!best || best.mateIn === null || best.moveSan === input.moveSan) return [];
  const mateFavoursMover = input.mover === 'white' ? best.mateIn > 0 : best.mateIn < 0;
  if (!mateFavoursMover) return [];
  return [{ category: 'mate', text: `Missed mate in ${Math.abs(best.mateIn)} starting with ${best.moveSan}` }];
}

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
  if (see(input.fenBefore, move.to as Square, side) <= 0) return [];
  return [{ category: 'material', text: `Missed ${best.moveSan}, winning material on ${move.to}` }];
}

function hangingPieceReasons(input: MoveReasonsInput): Reason[] {
  const pieces = (input.featureDelta?.newHangingPieces ?? []).filter((piece) => piece.color === input.mover);
  return pieces.map((piece) => ({
    category: 'material',
    text: `Leaves the ${PIECE_NAMES[piece.piece]} on ${piece.square} undefended`
  }));
}

function newForkReasons(input: MoveReasonsInput): Reason[] {
  const forks = input.featureDelta?.newForks ?? [];
  if (forks.length === 0) return [];

  const board = new Chess(input.fenAfter);
  return forks
    .filter((fork) => {
      const piece = board.get(fork.square as Square);
      return piece !== undefined && toColorName(piece.color) !== input.mover;
    })
    .map((fork) => ({
      category: 'tactical',
      text: `Allows ${PIECE_NAMES[fork.piece]} fork on ${fork.square} hitting ${formatList(fork.forkedSquares)}`
    }));
}

function underDefendedReasons(input: MoveReasonsInput): Reason[] {
  const pieces = (input.featuresAfter?.underDefendedPieces ?? []).filter((piece) => piece.color === input.mover);
  return pieces.map((piece) => ({
    category: 'tactical',
    text: `Leaves ${PIECE_NAMES[piece.piece]} on ${piece.square} attacked ${piece.attackers}× and defended ${piece.defenders}×`
  }));
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

function passedPawnReasons(input: MoveReasonsInput): Reason[] {
  const before = new Set(
    (input.featuresBefore?.passedPawns ?? []).filter((pawn) => pawn.color === input.mover).map((pawn) => pawn.square)
  );
  const after = (input.featuresAfter?.passedPawns ?? []).filter((pawn) => pawn.color === input.mover);

  return after
    .filter((pawn) => !before.has(pawn.square))
    .map((pawn) => ({ category: 'structural', text: `Creates a passed pawn on ${pawn.square[0]}` }));
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
  const delta = input.featureDelta?.mobilityDelta;
  if (delta === undefined || delta > MOBILITY_DROP_THRESHOLD) return [];
  return [{ category: 'mobility', text: `Costs ${Math.abs(delta)} squares of piece mobility` }];
}

/** "Recaptures the knight on d4" / "Trades bishops on c6" — see
 * `trade-description.ts` for which exchanges earn a sentence. */
function tradeReason(input: MoveReasonsInput): Reason[] {
  const text = describeTrade({
    fenBefore: input.fenBefore,
    moveSan: input.moveSan,
    isRecapture: input.isRecapture === true
  });
  return text ? [{ category: 'trade', text }] : [];
}

function formatList(squares: string[]): string {
  if (squares.length <= 1) return squares[0] ?? '';
  return `${squares.slice(0, -1).join(', ')} and ${squares[squares.length - 1]}`;
}

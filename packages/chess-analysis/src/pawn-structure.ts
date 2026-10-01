import type { Chess, Move, Square } from 'chess.js';
import type { PositionFeatures } from '@freechesscoach/shared';
import { occupiedSquares, toColorName } from './attack-map.js';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
type FileLetter = (typeof FILES)[number];

interface PawnStructureResult {
  openFiles: PositionFeatures['openFiles'];
  semiOpenFiles: PositionFeatures['semiOpenFiles'];
  doubledPawns: PositionFeatures['doubledPawns'];
  isolatedPawns: PositionFeatures['isolatedPawns'];
  passedPawns: PositionFeatures['passedPawns'];
}

export function pawnStructure(chess: Chess): PawnStructureResult {
  const pawnsByFile = new Map<string, { white: Square[]; black: Square[] }>();
  for (const file of FILES) pawnsByFile.set(file, { white: [], black: [] });

  for (const piece of occupiedSquares(chess)) {
    if (piece.type !== 'p') continue;
    const entry = pawnsByFile.get(fileOf(piece.square));
    entry?.[toColorName(piece.color)].push(piece.square);
  }

  return {
    openFiles: openFiles(pawnsByFile),
    semiOpenFiles: semiOpenFiles(pawnsByFile),
    doubledPawns: doubledPawns(pawnsByFile),
    isolatedPawns: isolatedPawns(pawnsByFile),
    passedPawns: passedPawns(pawnsByFile)
  };
}

/**
 * The squares of the mover's pawns that the move made passed, given the
 * passed pawns before and after it. A pawn is followed through the move, so
 * one that was passed already and only advanced (or took and changed file)
 * is not created; nor is a pawn on a file where the mover had a passed pawn
 * already (the doubled pawn behind it). At most one per file: the front one.
 */
export function createdPassedPawns(
  before: PositionFeatures['passedPawns'],
  after: PositionFeatures['passedPawns'],
  move: Pick<Move, 'color' | 'piece' | 'from' | 'to'>
): string[] {
  const mover = toColorName(move.color);
  const had = new Set(before.filter((pawn) => pawn.color === mover).map((pawn) => pawn.square));
  const hadOnFile = new Set([...had].map(fileOf));
  const cameFrom = (square: string): string => (move.piece === 'p' && square === move.to ? move.from : square);
  const gained = after
    .filter((pawn) => pawn.color === mover && !had.has(cameFrom(pawn.square)) && !hadOnFile.has(fileOf(pawn.square)))
    .map((pawn) => pawn.square);
  return gained.filter((square) => !gained.some((other) => fileOf(other) === fileOf(square) && isAhead(other, square, mover)));
}

function isAhead(square: string, of: string, color: 'white' | 'black'): boolean {
  return color === 'white' ? rankOf(square) > rankOf(of) : rankOf(square) < rankOf(of);
}

function fileOf(square: string): string {
  return square[0] ?? '';
}

function rankOf(square: string): number {
  return Number(square[1]);
}

function openFiles(pawnsByFile: Map<string, { white: Square[]; black: Square[] }>): string[] {
  return FILES.filter((file) => {
    const entry = pawnsByFile.get(file);
    return entry?.white.length === 0 && entry.black.length === 0;
  });
}

function semiOpenFiles(
  pawnsByFile: Map<string, { white: Square[]; black: Square[] }>
): PositionFeatures['semiOpenFiles'] {
  const result: PositionFeatures['semiOpenFiles'] = [];
  for (const file of FILES) {
    const entry = pawnsByFile.get(file);
    if (!entry) continue;
    if (entry.white.length === 0 && entry.black.length > 0) result.push({ file, openFor: 'white' });
    else if (entry.black.length === 0 && entry.white.length > 0) result.push({ file, openFor: 'black' });
  }
  return result;
}

function doubledPawns(pawnsByFile: Map<string, { white: Square[]; black: Square[] }>): PositionFeatures['doubledPawns'] {
  const result: PositionFeatures['doubledPawns'] = [];
  for (const file of FILES) {
    const entry = pawnsByFile.get(file);
    if (!entry) continue;
    if (entry.white.length >= 2) result.push({ file, color: 'white', count: entry.white.length });
    if (entry.black.length >= 2) result.push({ file, color: 'black', count: entry.black.length });
  }
  return result;
}

function isolatedPawns(pawnsByFile: Map<string, { white: Square[]; black: Square[] }>): PositionFeatures['isolatedPawns'] {
  const result: PositionFeatures['isolatedPawns'] = [];
  for (const [index, file] of FILES.entries()) {
    const entry = pawnsByFile.get(file);
    if (!entry) continue;
    const neighborFiles = [FILES[index - 1], FILES[index + 1]].filter((f): f is FileLetter => f !== undefined);
    for (const color of ['white', 'black'] as const) {
      const hasNeighborPawn = neighborFiles.some((f) => (pawnsByFile.get(f)?.[color].length ?? 0) > 0);
      if (hasNeighborPawn) continue;
      for (const square of entry[color]) result.push({ square, color });
    }
  }
  return result;
}

function passedPawns(pawnsByFile: Map<string, { white: Square[]; black: Square[] }>): PositionFeatures['passedPawns'] {
  const result: PositionFeatures['passedPawns'] = [];
  for (const [index, file] of FILES.entries()) {
    const entry = pawnsByFile.get(file);
    if (!entry) continue;
    const spanFiles = [FILES[index - 1], file, FILES[index + 1]].filter((f): f is FileLetter => f !== undefined);

    for (const pawn of entry.white) {
      const blocked = spanFiles.some((f) => (pawnsByFile.get(f)?.black ?? []).some((sq) => rankOf(sq) > rankOf(pawn)));
      if (!blocked) result.push({ square: pawn, color: 'white' });
    }
    for (const pawn of entry.black) {
      const blocked = spanFiles.some((f) => (pawnsByFile.get(f)?.white ?? []).some((sq) => rankOf(sq) < rankOf(pawn)));
      if (!blocked) result.push({ square: pawn, color: 'black' });
    }
  }
  return result;
}

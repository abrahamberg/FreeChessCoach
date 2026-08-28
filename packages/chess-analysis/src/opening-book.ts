import bookData from './generated/opening-book-index.json' with { type: 'json' };
import { positionKey } from './opening-book-key.js';

export type EcoVolume = 'A' | 'B' | 'C' | 'D' | 'E';
export type BookColour = 'white' | 'black';

export const OPENING_BOOK_SOURCE = 'lichess-org/chess-openings@2026-08-22';

export interface BookPosition {
  fen: string;
  moveSan: string | null;
  mover: BookColour | null;
}

export interface LeftBook {
  ply: number;
  played: string;
  alternatives: string[];
}

export interface PerPlyBookResult {
  ply: number;
  classification: 'book' | undefined;
  leftBook?: LeftBook;
}

export interface LastBookPly {
  white: number;
  black: number;
}

export type BookWalkResult = PerPlyBookResult[] & {
  lastBookPly: LastBookPly;
};

export interface OpeningResolution {
  eco: string;
  ecoVolume: EcoVolume;
  name: string;
  family: string;
  variation: string | null;
  ply: number;
}

interface BookEntry {
  san: string;
  uci: string;
  eco: string;
  name: string;
}

interface NameEntry {
  eco: string;
  ecoVolume: EcoVolume;
  name: string;
  ply: number;
}

interface OpeningBookData {
  bookIndex: Record<string, BookEntry[]>;
  nameIndex: Record<string, NameEntry>;
}

const openingBook = bookData as OpeningBookData;

/** Walks the game mainline until the first move outside the opening book. */
export function inBookWalk(positions: BookPosition[]): BookWalkResult {
  const result: PerPlyBookResult[] = [];
  const lastBookPly: LastBookPly = { white: 0, black: 0 };
  let inBook = true;

  for (let index = 1; index < positions.length; index += 1) {
    const position = positions[index];
    const previousPosition = positions[index - 1];
    if (!position || !previousPosition) continue;

    const moveResult: PerPlyBookResult = {
      ply: index,
      classification: undefined,
    };

    if (inBook) {
      const entries = findBookEntries(previousPosition.fen);
      if (isBookMove(position, entries)) {
        moveResult.classification = 'book';
        lastBookPly[position.mover] = index;
      } else {
        inBook = false;
        moveResult.leftBook = {
          ply: index,
          played: position.moveSan ?? '',
          alternatives: entries.map((entry) => entry.san),
        };
      }
    }

    result.push(moveResult);
  }

  return attachLastBookPly(result, lastBookPly);
}

/** Resolves the deepest named opening position, capped at the first 30 plies. */
export function resolveOpening(positionKeys: string[]): OpeningResolution | null {
  const lastSearchIndex = Math.min(positionKeys.length - 1, 30);

  for (let index = lastSearchIndex; index >= 0; index -= 1) {
    const key = positionKeys[index];
    if (key === undefined) continue;

    const entry = getOwnEntry(openingBook.nameIndex, key);
    if (entry) return toOpeningResolution(entry, index);
  }

  return null;
}

function findBookEntries(fen: string): BookEntry[] {
  return getOwnEntry(openingBook.bookIndex, positionKey(fen)) ?? [];
}

export interface BookMoveOption {
  san: string;
  uci: string;
  eco: string;
  name: string;
}

/**
 * Known book continuations from a live position (as opposed to
 * inBookWalk/resolveOpening, which classify an already-played mainline).
 * Used by bot move selection (the "Play vs Bot" plan) to follow known
 * theory instead of a shallow/personality-biased search in the opening —
 * empty once the position is out of book. Entries carry no frequency/weight
 * data, just the flat list of known alternatives from lichess-org's opening
 * database.
 */
export function bookMovesForFen(fen: string): BookMoveOption[] {
  return findBookEntries(fen);
}

function isBookMove(position: BookPosition, entries: BookEntry[]): position is BookPosition & {
  mover: BookColour;
  moveSan: string;
} {
  return position.mover !== null
    && position.moveSan !== null
    && entries.some((entry) => entry.san === position.moveSan);
}

function attachLastBookPly(
  result: PerPlyBookResult[],
  lastBookPly: LastBookPly,
): BookWalkResult {
  Object.defineProperty(result, 'lastBookPly', {
    configurable: false,
    enumerable: false,
    value: lastBookPly,
    writable: false,
  });
  return result as BookWalkResult;
}

function toOpeningResolution(entry: NameEntry, ply: number): OpeningResolution {
  const separatorIndex = entry.name.indexOf(': ');
  const family = separatorIndex === -1 ? entry.name : entry.name.slice(0, separatorIndex);
  const variation = separatorIndex === -1 ? null : entry.name.slice(separatorIndex + 2);

  return {
    eco: entry.eco,
    ecoVolume: entry.ecoVolume,
    name: entry.name,
    family,
    variation,
    ply,
  };
}

function getOwnEntry<T>(entries: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(entries, key) ? entries[key] : undefined;
}

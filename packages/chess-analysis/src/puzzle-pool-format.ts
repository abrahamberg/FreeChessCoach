import type { PuzzleRecord } from './puzzle-selection.js';

/**
 * Binary format (v1) for the pre-built puzzle pool
 * (`apps/api/scripts/build-puzzle-pool.mjs` builds it,
 * `apps/api/src/services/puzzle-pool.ts` reads it) — see `docs/plan.md`
 * Task 59.1 for why this is a whole-file decode into memory rather than
 * `lichess-eval-index-format.ts`'s fixed-stride, disk-backed
 * binary-search layout: that format exists because ~394M positions don't
 * fit in memory, and a puzzle pool (low hundreds of thousands of rows at
 * most) does.
 *
 * File layout: an 8-byte magic header (`PUZZLE_POOL_MAGIC`), a uint32
 * record count, then records back-to-back, each:
 *
 * - `puzzleId` (5 ASCII bytes — every Lichess puzzle ID is exactly 5
 *   base62 characters, e.g. `"08XzM"`)
 * - `rating` (uint16 BE)
 * - `themes` (uint32 BE bitmask over `PUZZLE_POOL_THEMES` — the fixed,
 *   ordered theme list this format version supports; a theme this pool
 *   was built against that isn't in the list is silently dropped, not an
 *   error, since Lichess tags each puzzle with several and only the ones
 *   this app actually selects on matter here)
 * - `fen` (uint16 BE length, then that many UTF-8 bytes)
 * - `moves` (uint16 BE length, then that many UTF-8 bytes — the puzzle's
 *   full UCI solution, space-joined, first token the opponent's setup
 *   move per Lichess's own convention — see `puzzle-selection.ts`'s doc
 *   comment)
 *
 * Record count exists only as a build-time sanity check (the builder
 * writes what it counted, the reader can assert it matches what it
 * decoded) — the format doesn't need it to know where records end, since
 * every field is self-describing (fixed width or length-prefixed).
 */
export const PUZZLE_POOL_MAGIC = Buffer.from('PZLPOOL1', 'ascii');

export const PUZZLE_POOL_ID_SIZE = 5;

/** Fixed, ordered — index into this array IS the bit position in a
 * record's `themes` bitmask. Append-only: removing or reordering an
 * entry changes the meaning of every bit already written to a deployed
 * `.bin` file. Must stay in sync with `apps/api/scripts/build-puzzle-
 * pool.mjs`'s own theme allowlist and `puzzle-selection.ts`'s
 * `DIAGNOSIS_CODE_PUZZLE_THEMES`. */
export const PUZZLE_POOL_THEMES = [
  'mateIn1',
  'mateIn2',
  'mateIn3',
  'mateIn4',
  'mateIn5',
  'backRankMate',
  'fork',
  'pin',
  'skewer',
  'discoveredAttack',
  'doubleCheck',
  'capturingDefender',
  'deflection',
  'trappedPiece',
  'hangingPiece',
  'exposedKing',
  'discoveredCheck',
  'promotion',
  'quietMove',
  'defensiveMove',
  'zugzwang',
  'intermezzo',
  'attraction'
] as const;

if (PUZZLE_POOL_THEMES.length > 32) {
  throw new Error('PUZZLE_POOL_THEMES exceeds 32 entries — themes no longer fit a uint32 bitmask');
}

const THEME_BIT: ReadonlyMap<string, number> = new Map(PUZZLE_POOL_THEMES.map((theme, index) => [theme, index]));

export function themesToBitmask(themes: readonly string[]): number {
  let mask = 0;
  for (const theme of themes) {
    const bit = THEME_BIT.get(theme);
    if (bit !== undefined) mask |= 1 << bit;
  }
  return mask >>> 0;
}

export function bitmaskToThemes(mask: number): string[] {
  return PUZZLE_POOL_THEMES.filter((_, bit) => (mask & (1 << bit)) !== 0);
}

/** `true` when `buffer` starts with the current magic header — `false`
 * for a too-short buffer (including empty/missing-file) or a differently
 * versioned one, same "unusable, caller decides how to degrade" contract
 * as `lichess-eval-index-format.ts`'s `hasValidMagic`. */
export function hasValidPuzzlePoolMagic(buffer: Buffer): boolean {
  return buffer.length >= PUZZLE_POOL_MAGIC.length && buffer.subarray(0, PUZZLE_POOL_MAGIC.length).equals(PUZZLE_POOL_MAGIC);
}

export function packPuzzlePool(records: readonly PuzzleRecord[]): Buffer {
  const parts: Buffer[] = [PUZZLE_POOL_MAGIC, uint32(records.length)];

  for (const record of records) {
    if (Buffer.byteLength(record.puzzleId, 'ascii') !== PUZZLE_POOL_ID_SIZE) {
      throw new Error(`puzzleId "${record.puzzleId}" must be exactly ${PUZZLE_POOL_ID_SIZE} ASCII bytes`);
    }
    const fenBytes = Buffer.from(record.fen, 'utf8');
    const movesBytes = Buffer.from(record.moves.join(' '), 'utf8');

    parts.push(
      Buffer.from(record.puzzleId, 'ascii'),
      uint16(record.rating),
      uint32(themesToBitmask(record.themes)),
      uint16(fenBytes.length),
      fenBytes,
      uint16(movesBytes.length),
      movesBytes
    );
  }

  return Buffer.concat(parts);
}

export function unpackPuzzlePool(buffer: Buffer): PuzzleRecord[] {
  if (!hasValidPuzzlePoolMagic(buffer)) {
    throw new Error('not a valid puzzle pool file (bad or missing magic header)');
  }

  const recordCount = buffer.readUInt32BE(PUZZLE_POOL_MAGIC.length);
  let cursor = PUZZLE_POOL_MAGIC.length + 4;
  const records: PuzzleRecord[] = [];

  for (let i = 0; i < recordCount; i++) {
    const puzzleId = buffer.subarray(cursor, cursor + PUZZLE_POOL_ID_SIZE).toString('ascii');
    cursor += PUZZLE_POOL_ID_SIZE;

    const rating = buffer.readUInt16BE(cursor);
    cursor += 2;

    const themes = bitmaskToThemes(buffer.readUInt32BE(cursor));
    cursor += 4;

    const fenLength = buffer.readUInt16BE(cursor);
    cursor += 2;
    const fen = buffer.subarray(cursor, cursor + fenLength).toString('utf8');
    cursor += fenLength;

    const movesLength = buffer.readUInt16BE(cursor);
    cursor += 2;
    const moves = buffer
      .subarray(cursor, cursor + movesLength)
      .toString('utf8')
      .split(' ');
    cursor += movesLength;

    records.push({ puzzleId, fen, moves, rating, themes });
  }

  if (records.length !== recordCount) {
    throw new Error(`puzzle pool header declared ${recordCount} records, decoded ${records.length}`);
  }
  return records;
}

function uint16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value);
  return buffer;
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

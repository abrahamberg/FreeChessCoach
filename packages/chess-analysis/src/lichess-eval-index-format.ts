import { createHash } from 'node:crypto';
import { ENGINE_MULTI_PV } from '@freechesscoach/shared';
import { positionKey } from './opening-book-key.js';
import { scanDepthForRank } from './prevention-scan-schedule.js';

/**
 * Binary record layout (v3) for the pre-built, read-only Lichess evaluation
 * index (apps/api/scripts/build-lichess-eval-index.mjs builds it,
 * apps/api/src/services/engine/lichess-eval-index.ts reads it). Records are
 * fixed-width and sorted by `key`, so a lookup is a plain binary search over
 * the file — no database engine, no in-memory index of hundreds of millions
 * of entries needed.
 *
 * File layout: an 8-byte magic header (`LICHESS_EVAL_MAGIC`), then records
 * back-to-back. v2 kept up to `LICHESS_EVAL_MAX_LINES` lines, each a single
 * move; v3 (Phase 49) widens each line's slot to hold a real multi-ply
 * continuation — `scanDepthForRank(rank)` UCI moves instead of just one — so
 * `scanAvailableMotifs`' graduated schedule (prevention-scan-schedule.ts) can
 * walk real Lichess-sourced PVs instead of only ever seeing ply 1 for
 * positions served from this index. The magic header bump (`LCEVAL02` ->
 * `LCEVAL03`) lets the reader tell a stale v2 file apart and soft-skip it
 * (see lichess-eval-index.ts) instead of misreading bytes under the new,
 * per-rank-variable layout, mirroring the v1->v2 pattern.
 *
 * key (16 bytes): sha256(positionKey(fen)) truncated to 128 bits. Reuses the
 * same EPD-style normalization (placement, side to move, castling, only a
 * *legal* en-passant square) the opening book already keys on — Lichess's
 * own `fen` field in the source dataset is normalized the same way (no
 * halfmove/fullmove counters), so this maximizes hit rate without needing a
 * second normalization scheme. 128 bits keeps collision probability
 * negligible even across hundreds of millions of positions (birthday bound
 * ≈ 1e17 / 3.4e38).
 *
 * value: depth(1) + lineCount(1) + one slot per rank 0..`LICHESS_EVAL_MAX_LINES-1`.
 * Each rank's slot is `flags(1) + cp(int16) + mate(int8) + scanDepthForRank(rank)`
 * UCI moves (5 ascii bytes each, NUL-padded) — wider for a top-ranked line
 * than a bottom-ranked one, since the schedule itself tapers by rank. Still
 * fixed-stride *per file* (every record has the same total value size, since
 * every record has the same set of per-rank slot widths), so a lookup can
 * still binary-search by a constant record stride. Only the first
 * `lineCount` slots hold real data; unused trailing rank slots — and any
 * pvUci tokens beyond what a given line actually had — are zero-filled and
 * ignored on read.
 */
export const LICHESS_EVAL_MAGIC = Buffer.from('LCEVAL03', 'ascii');
/** The magic header of the previous (v2) format — kept only so callers can
 * recognize and log a stale file distinctly; the reader itself just treats
 * anything that isn't the current `LICHESS_EVAL_MAGIC` as unusable. */
export const LICHESS_EVAL_MAGIC_V2 = Buffer.from('LCEVAL02', 'ascii');

export const LICHESS_EVAL_KEY_SIZE = 16;
export const LICHESS_EVAL_MOVE_SIZE = 5;
export const LICHESS_EVAL_MAX_LINES = ENGINE_MULTI_PV;
const LICHESS_EVAL_LINE_HEADER_SIZE = 1 + 2 + 1; // flags + cp(int16) + mate(int8)

/** This rank's total slot width in bytes: the fixed per-line header plus
 * room for `scanDepthForRank(rank)` UCI moves. */
export function lichessEvalLineSlotSize(rank: number): number {
  return LICHESS_EVAL_LINE_HEADER_SIZE + scanDepthForRank(rank) * LICHESS_EVAL_MOVE_SIZE;
}

const LINE_SLOT_SIZES = Array.from({ length: LICHESS_EVAL_MAX_LINES }, (_, rank) => lichessEvalLineSlotSize(rank));
const LINE_SLOT_OFFSETS = LINE_SLOT_SIZES.reduce<number[]>((offsets, size, rank) => {
  offsets.push(rank === 0 ? 0 : offsets[rank - 1]! + LINE_SLOT_SIZES[rank - 1]!);
  return offsets;
}, []);
const LINES_SECTION_SIZE = LINE_SLOT_SIZES.reduce((sum, size) => sum + size, 0);

export const LICHESS_EVAL_VALUE_SIZE = 1 + 1 + LINES_SECTION_SIZE;
export const LICHESS_EVAL_RECORD_SIZE = LICHESS_EVAL_KEY_SIZE + LICHESS_EVAL_VALUE_SIZE;

const HAS_MATE_FLAG = 0b1;

export interface LichessEvalLine {
  cp: number | null;
  mate: number | null;
  /** This line's harvested PV continuation in UCI, own move first — between
   * 1 and `scanDepthForRank(rank)` tokens (a short source `pv.line` just
   * yields fewer plies than the schedule's ceiling for that rank). */
  pvUci: string[];
}

export interface LichessEvalEntry {
  /** Any valid FEN for the position (normalized internally via positionKey). */
  fen: string;
  depth: number;
  /** 1..LICHESS_EVAL_MAX_LINES, best line first. */
  lines: LichessEvalLine[];
}

export interface LichessEvalRecord {
  key: Buffer;
  depth: number;
  lines: LichessEvalLine[];
}

/** The sort/lookup key for a position — same value at build time and at
 * lookup time, so a lookup's key always lands where the builder put it. */
export function computeIndexKey(fen: string): Buffer {
  return Buffer.from(createHash('sha256').update(positionKey(fen)).digest().subarray(0, LICHESS_EVAL_KEY_SIZE));
}

/** `true` when `buffer` starts with the v3 magic header — `false` for a
 * too-short buffer (including an empty one) or a stale v1/v2 file, which
 * either never had a header or had a different one, so neither can
 * coincidentally match it. */
export function hasValidMagic(buffer: Buffer): boolean {
  return buffer.length >= LICHESS_EVAL_MAGIC.length && buffer.subarray(0, LICHESS_EVAL_MAGIC.length).equals(LICHESS_EVAL_MAGIC);
}

export function packEntry(entry: LichessEvalEntry): Buffer {
  if (entry.lines.length === 0) {
    throw new Error(`entry for "${entry.fen}" must have at least one line`);
  }
  if (entry.lines.length > LICHESS_EVAL_MAX_LINES) {
    throw new Error(`entry for "${entry.fen}" has ${entry.lines.length} lines, exceeding the max of ${LICHESS_EVAL_MAX_LINES}`);
  }
  entry.lines.forEach((line, rank) => {
    if ((line.cp === null) === (line.mate === null)) {
      throw new Error(`line for "${entry.fen}" must set exactly one of cp/mate`);
    }
    const maxDepth = scanDepthForRank(rank);
    if (line.pvUci.length === 0 || line.pvUci.length > maxDepth) {
      throw new Error(`line for "${entry.fen}" at rank ${rank} has ${line.pvUci.length} pvUci moves, expected 1..${maxDepth}`);
    }
    for (const moveUci of line.pvUci) {
      if (Buffer.byteLength(moveUci, 'ascii') > LICHESS_EVAL_MOVE_SIZE) {
        throw new Error(`moveUci "${moveUci}" exceeds ${LICHESS_EVAL_MOVE_SIZE} bytes`);
      }
    }
  });

  const buffer = Buffer.alloc(LICHESS_EVAL_RECORD_SIZE);
  computeIndexKey(entry.fen).copy(buffer, 0);

  const valueStart = LICHESS_EVAL_KEY_SIZE;
  buffer.writeUInt8(entry.depth, valueStart);
  buffer.writeUInt8(entry.lines.length, valueStart + 1);
  const linesStart = valueStart + 2;

  entry.lines.forEach((line, rank) => {
    let offset = linesStart + LINE_SLOT_OFFSETS[rank]!;
    buffer.writeUInt8(line.mate !== null ? HAS_MATE_FLAG : 0, offset);
    offset += 1;
    buffer.writeInt16BE(line.cp ?? 0, offset);
    offset += 2;
    buffer.writeInt8(line.mate ?? 0, offset);
    offset += 1;
    for (const moveUci of line.pvUci) {
      buffer.write(moveUci, offset, 'ascii'); // remaining bytes stay 0x00 (Buffer.alloc zero-fills)
      offset += LICHESS_EVAL_MOVE_SIZE;
    }
    // Any pvUci slots beyond line.pvUci.length (within this rank's own
    // width), and any rank beyond entry.lines.length, stay zero-filled and
    // are never read (unpackRecord stops each line's tokens at the first
    // empty one, and the whole record at lineCount).
  });

  return buffer;
}

export function unpackRecord(buffer: Buffer, offset = 0): LichessEvalRecord {
  const key = Buffer.from(buffer.subarray(offset, offset + LICHESS_EVAL_KEY_SIZE));
  const valueStart = offset + LICHESS_EVAL_KEY_SIZE;

  const depth = buffer.readUInt8(valueStart);
  const lineCount = buffer.readUInt8(valueStart + 1);
  const linesStart = valueStart + 2;

  const lines: LichessEvalLine[] = [];
  for (let rank = 0; rank < lineCount; rank++) {
    let cursor = linesStart + LINE_SLOT_OFFSETS[rank]!;

    const flags = buffer.readUInt8(cursor);
    cursor += 1;
    const cpRaw = buffer.readInt16BE(cursor);
    cursor += 2;
    const mateRaw = buffer.readInt8(cursor);
    cursor += 1;

    const maxDepth = scanDepthForRank(rank);
    const pvUci: string[] = [];
    for (let i = 0; i < maxDepth; i++) {
      const moveUci = buffer
        .subarray(cursor, cursor + LICHESS_EVAL_MOVE_SIZE)
        .toString('ascii')
        .replace(/\0+$/, '');
      cursor += LICHESS_EVAL_MOVE_SIZE;
      if (!moveUci) break;
      pvUci.push(moveUci);
    }

    const hasMate = (flags & HAS_MATE_FLAG) !== 0;
    lines.push({ cp: hasMate ? null : cpRaw, mate: hasMate ? mateRaw : null, pvUci });
  }

  return { key, depth, lines };
}

export function compareKeys(a: Buffer, b: Buffer): number {
  return Buffer.compare(a, b);
}

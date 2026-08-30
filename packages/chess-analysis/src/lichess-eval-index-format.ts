import { createHash } from 'node:crypto';
import { ENGINE_MULTI_PV } from '@freechesscoach/shared';
import { positionKey } from './opening-book-key.js';

/**
 * Binary record layout (v2) for the pre-built, read-only Lichess evaluation
 * index (apps/api/scripts/build-lichess-eval-index.mjs builds it,
 * apps/api/src/services/engine/lichess-eval-index.ts reads it). Records are
 * fixed-width and sorted by `key`, so a lookup is a plain binary search over
 * the file — no database engine, no in-memory index of hundreds of millions
 * of entries needed.
 *
 * File layout: an 8-byte magic header (`LICHESS_EVAL_MAGIC`), then records
 * back-to-back. v1 files had no header at all and stored exactly one line
 * per position — this format keeps up to `LICHESS_EVAL_MAX_LINES` (matching
 * `ENGINE_MULTI_PV`), since the source dataset carries multiple PVs per
 * position and every other engine backend now reports that many lines too.
 * The magic header lets the reader tell a stale v1 file apart from a v2 one
 * and degrade gracefully (see lichess-eval-index.ts) instead of misreading
 * bytes under the new, wider layout.
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
 * value: depth(1) + lineCount(1) + `LICHESS_EVAL_MAX_LINES` fixed slots,
 * each `flags(1) + cp(int16) + mate(int8) + moveUci(5 ascii, NUL-padded)` =
 * 9 bytes. Only the first `lineCount` slots hold real data; the rest are
 * zero-filled and ignored on read — this keeps every record the same fixed
 * width (so a lookup can binary-search by a constant stride) at the cost of
 * some wasted space for positions with fewer than `LICHESS_EVAL_MAX_LINES`
 * recorded lines (the dataset averages ~2.4 lines/position).
 */
export const LICHESS_EVAL_MAGIC = Buffer.from('LCEVAL02', 'ascii');

export const LICHESS_EVAL_KEY_SIZE = 16;
export const LICHESS_EVAL_MOVE_SIZE = 5;
export const LICHESS_EVAL_MAX_LINES = ENGINE_MULTI_PV;
const LICHESS_EVAL_LINE_SLOT_SIZE = 1 + 2 + 1 + LICHESS_EVAL_MOVE_SIZE;
export const LICHESS_EVAL_VALUE_SIZE = 1 + 1 + LICHESS_EVAL_MAX_LINES * LICHESS_EVAL_LINE_SLOT_SIZE;
export const LICHESS_EVAL_RECORD_SIZE = LICHESS_EVAL_KEY_SIZE + LICHESS_EVAL_VALUE_SIZE;

const HAS_MATE_FLAG = 0b1;

export interface LichessEvalLine {
  cp: number | null;
  mate: number | null;
  moveUci: string;
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

/** `true` when `buffer` starts with the v2 magic header — `false` for a
 * too-short buffer (including an empty one) or a stale v1 file, which never
 * had a header and so can't coincidentally match it (the v1 format's very
 * first bytes are always a sha256-derived key, not this fixed ascii tag). */
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
  for (const line of entry.lines) {
    if (Buffer.byteLength(line.moveUci, 'ascii') > LICHESS_EVAL_MOVE_SIZE) {
      throw new Error(`moveUci "${line.moveUci}" exceeds ${LICHESS_EVAL_MOVE_SIZE} bytes`);
    }
    if ((line.cp === null) === (line.mate === null)) {
      throw new Error(`line for "${entry.fen}" must set exactly one of cp/mate`);
    }
  }

  const buffer = Buffer.alloc(LICHESS_EVAL_RECORD_SIZE);
  computeIndexKey(entry.fen).copy(buffer, 0);

  let offset = LICHESS_EVAL_KEY_SIZE;
  buffer.writeUInt8(entry.depth, offset);
  offset += 1;
  buffer.writeUInt8(entry.lines.length, offset);
  offset += 1;

  for (const line of entry.lines) {
    buffer.writeUInt8(line.mate !== null ? HAS_MATE_FLAG : 0, offset);
    offset += 1;
    buffer.writeInt16BE(line.cp ?? 0, offset);
    offset += 2;
    buffer.writeInt8(line.mate ?? 0, offset);
    offset += 1;
    buffer.write(line.moveUci, offset, 'ascii'); // remaining bytes stay 0x00 (Buffer.alloc zero-fills)
    offset += LICHESS_EVAL_MOVE_SIZE;
  }
  // Unused slots beyond entry.lines.length stay zero-filled and are never read (unpackRecord stops at lineCount).

  return buffer;
}

export function unpackRecord(buffer: Buffer, offset = 0): LichessEvalRecord {
  const key = Buffer.from(buffer.subarray(offset, offset + LICHESS_EVAL_KEY_SIZE));
  let cursor = offset + LICHESS_EVAL_KEY_SIZE;

  const depth = buffer.readUInt8(cursor);
  cursor += 1;
  const lineCount = buffer.readUInt8(cursor);
  cursor += 1;

  const lines: LichessEvalLine[] = [];
  for (let i = 0; i < lineCount; i++) {
    const flags = buffer.readUInt8(cursor);
    cursor += 1;
    const cpRaw = buffer.readInt16BE(cursor);
    cursor += 2;
    const mateRaw = buffer.readInt8(cursor);
    cursor += 1;
    const moveUci = buffer
      .subarray(cursor, cursor + LICHESS_EVAL_MOVE_SIZE)
      .toString('ascii')
      .replace(/\0+$/, '');
    cursor += LICHESS_EVAL_MOVE_SIZE;

    const hasMate = (flags & HAS_MATE_FLAG) !== 0;
    lines.push({ cp: hasMate ? null : cpRaw, mate: hasMate ? mateRaw : null, moveUci });
  }

  return { key, depth, lines };
}

export function compareKeys(a: Buffer, b: Buffer): number {
  return Buffer.compare(a, b);
}

import { createHash } from 'node:crypto';
import { positionKey } from './opening-book-key.js';

/**
 * Binary record layout for the pre-built, read-only Lichess evaluation index
 * (apps/api/scripts/build-lichess-eval-index.mts builds it,
 * apps/api/src/services/engine/lichess-eval-index.ts reads it). Records are
 * fixed-width and sorted by `key`, so a lookup is a plain binary search over
 * the file — no database engine, no in-memory index of 394M+ entries needed.
 *
 * key (16 bytes): sha256(positionKey(fen)) truncated to 128 bits. Reuses the
 * same EPD-style normalization (placement, side to move, castling, only a
 * *legal* en-passant square) the opening book already keys on — Lichess's
 * own `fen` field in the source dataset is normalized the same way (no
 * halfmove/fullmove counters), so this maximizes hit rate without needing a
 * second normalization scheme. 128 bits keeps collision probability
 * negligible even across ~4×10^8 positions (birthday bound ≈ 1e17 / 3.4e38).
 *
 * value (5 bytes): flags(1) + cp(int16) + mate(int8) + depth(uint8) +
 * moveUci(5 ascii bytes, NUL-padded). Only the single best line is stored
 * (v1 decision — see the plan doc: the dataset averages ~2.4 lines/position,
 * not a consistent 3, so matching ENGINE_MULTI_PV exactly isn't worth the
 * variable-length record it would require).
 */
export const LICHESS_EVAL_KEY_SIZE = 16;
export const LICHESS_EVAL_MOVE_SIZE = 5;
export const LICHESS_EVAL_VALUE_SIZE = 1 + 2 + 1 + 1 + LICHESS_EVAL_MOVE_SIZE;
export const LICHESS_EVAL_RECORD_SIZE = LICHESS_EVAL_KEY_SIZE + LICHESS_EVAL_VALUE_SIZE;

const HAS_MATE_FLAG = 0b1;

export interface LichessEvalEntry {
  /** Any valid FEN for the position (normalized internally via positionKey). */
  fen: string;
  cp: number | null;
  mate: number | null;
  depth: number;
  moveUci: string;
}

export interface LichessEvalRecord {
  key: Buffer;
  cp: number | null;
  mate: number | null;
  depth: number;
  moveUci: string;
}

/** The sort/lookup key for a position — same value at build time and at
 * lookup time, so a lookup's key always lands where the builder put it. */
export function computeIndexKey(fen: string): Buffer {
  return Buffer.from(createHash('sha256').update(positionKey(fen)).digest().subarray(0, LICHESS_EVAL_KEY_SIZE));
}

export function packEntry(entry: LichessEvalEntry): Buffer {
  if (Buffer.byteLength(entry.moveUci, 'ascii') > LICHESS_EVAL_MOVE_SIZE) {
    throw new Error(`moveUci "${entry.moveUci}" exceeds ${LICHESS_EVAL_MOVE_SIZE} bytes`);
  }
  if ((entry.cp === null) === (entry.mate === null)) {
    throw new Error(`entry for "${entry.fen}" must set exactly one of cp/mate`);
  }

  const buffer = Buffer.alloc(LICHESS_EVAL_RECORD_SIZE);
  computeIndexKey(entry.fen).copy(buffer, 0);

  let offset = LICHESS_EVAL_KEY_SIZE;
  buffer.writeUInt8(entry.mate !== null ? HAS_MATE_FLAG : 0, offset);
  offset += 1;
  buffer.writeInt16BE(entry.cp ?? 0, offset);
  offset += 2;
  buffer.writeInt8(entry.mate ?? 0, offset);
  offset += 1;
  buffer.writeUInt8(entry.depth, offset);
  offset += 1;
  buffer.write(entry.moveUci, offset, 'ascii'); // remaining bytes stay 0x00 (Buffer.alloc zero-fills)

  return buffer;
}

export function unpackRecord(buffer: Buffer, offset = 0): LichessEvalRecord {
  const key = Buffer.from(buffer.subarray(offset, offset + LICHESS_EVAL_KEY_SIZE));
  let cursor = offset + LICHESS_EVAL_KEY_SIZE;

  const flags = buffer.readUInt8(cursor);
  cursor += 1;
  const cpRaw = buffer.readInt16BE(cursor);
  cursor += 2;
  const mateRaw = buffer.readInt8(cursor);
  cursor += 1;
  const depth = buffer.readUInt8(cursor);
  cursor += 1;
  const moveUci = buffer
    .subarray(cursor, cursor + LICHESS_EVAL_MOVE_SIZE)
    .toString('ascii')
    .replace(/\0+$/, '');

  const hasMate = (flags & HAS_MATE_FLAG) !== 0;
  return { key, cp: hasMate ? null : cpRaw, mate: hasMate ? mateRaw : null, depth, moveUci };
}

export function compareKeys(a: Buffer, b: Buffer): number {
  return Buffer.compare(a, b);
}

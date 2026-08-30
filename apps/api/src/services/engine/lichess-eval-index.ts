import { open, type FileHandle } from 'node:fs/promises';
import {
  compareKeys,
  computeIndexKey,
  hasValidMagic,
  LICHESS_EVAL_MAGIC,
  LICHESS_EVAL_RECORD_SIZE,
  unpackRecord,
  type LichessEvalLine,
  type LichessEvalRecord
} from '@freechesscoach/chess-analysis/lichess-eval-index-format';

export interface LichessEvalLookupResult {
  depth: number;
  /** 1..LICHESS_EVAL_MAX_LINES, best line first. */
  lines: LichessEvalLine[];
}

/** Thrown by `LichessEvalIndex.open` when the file doesn't start with the
 * expected v3 magic header — most likely a stale v1/v2-format file still on
 * disk after a code deploy. Distinguished from a generic corrupt-file error
 * so `bootstrap.ts` can treat it the same as a missing file (soft-skip the
 * Lichess tier with a warning) rather than crash-looping the process. */
export class LichessEvalIndexFormatError extends Error {}

/** The narrow read surface LichessEvalEngineBackend depends on — lets tests
 * fake a lookup table without opening a real file. */
export interface LichessEvalReader {
  lookup(fen: string): Promise<LichessEvalLookupResult | null>;
}

/**
 * Read-only binary-search reader over the pre-built, sorted, fixed-width
 * Lichess evaluation index file (see lichess-eval-index-format.ts in
 * @freechesscoach/chess-analysis for the record layout, and
 * apps/api/scripts/build-lichess-eval-index.mjs for how the file is
 * produced and refreshed — independently of app deploys, per the plan doc).
 *
 * No in-memory index is built: a lookup does at most ~log2(recordCount)
 * small reads directly against the open file descriptor, and the OS page
 * cache keeps hot regions resident across repeated lookups for free. That's
 * the whole point of this format — a running database engine would be
 * solving a problem (concurrent writes) this data doesn't have.
 */
export class LichessEvalIndex implements LichessEvalReader {
  private constructor(
    private readonly handle: FileHandle,
    private readonly recordCount: number
  ) {}

  static async open(filePath: string): Promise<LichessEvalIndex> {
    const handle = await open(filePath, 'r');
    try {
      const { size } = await handle.stat();

      const header = Buffer.alloc(LICHESS_EVAL_MAGIC.length);
      if (size >= LICHESS_EVAL_MAGIC.length) {
        await handle.read(header, 0, LICHESS_EVAL_MAGIC.length, 0);
      }
      if (!hasValidMagic(header)) {
        throw new LichessEvalIndexFormatError(
          `Lichess eval index "${filePath}" does not start with the expected v3 magic header — likely a stale v1/v2-format file (or an unrelated/corrupt file) still on disk.`
        );
      }

      const dataSize = size - LICHESS_EVAL_MAGIC.length;
      if (dataSize % LICHESS_EVAL_RECORD_SIZE !== 0) {
        throw new Error(
          `Lichess eval index "${filePath}" has size ${size}, not the header plus a multiple of the record size ${LICHESS_EVAL_RECORD_SIZE} — file is corrupt`
        );
      }
      return new LichessEvalIndex(handle, dataSize / LICHESS_EVAL_RECORD_SIZE);
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.handle.close();
  }

  async lookup(fen: string): Promise<LichessEvalLookupResult | null> {
    const targetKey = computeIndexKey(fen);

    let low = 0;
    let high = this.recordCount - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const record = await this.readRecord(mid);
      const comparison = compareKeys(targetKey, record.key);
      if (comparison === 0) return { depth: record.depth, lines: record.lines };
      if (comparison < 0) high = mid - 1;
      else low = mid + 1;
    }
    return null;
  }

  private async readRecord(index: number): Promise<LichessEvalRecord> {
    const buffer = Buffer.alloc(LICHESS_EVAL_RECORD_SIZE);
    await this.handle.read(buffer, 0, LICHESS_EVAL_RECORD_SIZE, LICHESS_EVAL_MAGIC.length + index * LICHESS_EVAL_RECORD_SIZE);
    return unpackRecord(buffer);
  }
}

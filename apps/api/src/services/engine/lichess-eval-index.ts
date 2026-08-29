import { open, type FileHandle } from 'node:fs/promises';
import {
  compareKeys,
  computeIndexKey,
  LICHESS_EVAL_RECORD_SIZE,
  unpackRecord,
  type LichessEvalRecord
} from '@freechesscoach/chess-analysis/lichess-eval-index-format';

export interface LichessEvalLookupResult {
  cp: number | null;
  mate: number | null;
  depth: number;
  moveUci: string;
}

/** The narrow read surface LichessEvalEngineBackend depends on — lets tests
 * fake a lookup table without opening a real file. */
export interface LichessEvalReader {
  lookup(fen: string): Promise<LichessEvalLookupResult | null>;
}

/**
 * Read-only binary-search reader over the pre-built, sorted, fixed-width
 * Lichess evaluation index file (see lichess-eval-index-format.ts in
 * @freechesscoach/chess-analysis for the record layout, and
 * apps/api/scripts/build-lichess-eval-index.mts for how the file is
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
    const { size } = await handle.stat();
    if (size % LICHESS_EVAL_RECORD_SIZE !== 0) {
      await handle.close();
      throw new Error(
        `Lichess eval index "${filePath}" has size ${size}, not a multiple of the record size ${LICHESS_EVAL_RECORD_SIZE} — file is corrupt or was built with a different format version`
      );
    }
    return new LichessEvalIndex(handle, size / LICHESS_EVAL_RECORD_SIZE);
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
      if (comparison === 0) return { cp: record.cp, mate: record.mate, depth: record.depth, moveUci: record.moveUci };
      if (comparison < 0) high = mid - 1;
      else low = mid + 1;
    }
    return null;
  }

  private async readRecord(index: number): Promise<LichessEvalRecord> {
    const buffer = Buffer.alloc(LICHESS_EVAL_RECORD_SIZE);
    await this.handle.read(buffer, 0, LICHESS_EVAL_RECORD_SIZE, index * LICHESS_EVAL_RECORD_SIZE);
    return unpackRecord(buffer);
  }
}

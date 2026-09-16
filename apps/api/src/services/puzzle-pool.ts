import { readFile } from 'node:fs/promises';
import type { PuzzleRecord } from '@freechesscoach/chess-analysis';
import { hasValidPuzzlePoolMagic, unpackPuzzlePool } from '@freechesscoach/chess-analysis/puzzle-pool-format';

/** Thrown when a file exists at `PUZZLE_POOL_PATH` but doesn't start with
 * the expected magic header — most likely a stale/differently-versioned
 * file still on disk after a format change. Distinguished from a generic
 * corrupt-file error the same way `LichessEvalIndexFormatError` is (see
 * lichess-eval-index.ts): `openPuzzlePoolFromEnv` treats this the same as
 * a missing file (soft-skip with a warning), everything else throws. */
export class PuzzlePoolFormatError extends Error {}

/**
 * The full puzzle pool (`docs/plan.md` Task 59.1), read whole into memory
 * once at process start — see `puzzle-pool-format.ts`'s doc comment for
 * why this format is a whole-file decode rather than
 * `lichess-eval-index.ts`'s disk-backed binary search: a puzzle pool is
 * orders of magnitude smaller than the Lichess evaluation dataset, so
 * there's no memory pressure to page it in a piece at a time.
 */
export class PuzzlePool {
  private constructor(private readonly records: readonly PuzzleRecord[]) {}

  static async open(filePath: string): Promise<PuzzlePool> {
    const buffer = await readFile(filePath);
    if (!hasValidPuzzlePoolMagic(buffer)) {
      throw new PuzzlePoolFormatError(`"${filePath}" is not a valid puzzle pool file (bad or missing magic header)`);
    }
    return new PuzzlePool(unpackPuzzlePool(buffer));
  }

  all(): readonly PuzzleRecord[] {
    return this.records;
  }
}

/** Opens the pre-built puzzle pool (`scripts/build-puzzle-pool.mjs`) when
 * `PUZZLE_POOL_PATH` is set, once per process at startup — same "unset or
 * not-yet-populated is a safe null, only a real format problem throws"
 * contract `openLichessEvalIndexFromEnv` uses, since this file lives on the
 * same out-of-band-populated PVC (`apps/api/data/README.md`). Not yet
 * wired into `bootstrap.ts`: nothing calls this until Task 59.3
 * (background puzzle assignment) exists to consume it. */
export async function openPuzzlePoolFromEnv(): Promise<PuzzlePool | null> {
  const filePath = process.env.PUZZLE_POOL_PATH;
  if (!filePath) return null;
  try {
    return await PuzzlePool.open(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(
        `PUZZLE_POOL_PATH is set to "${filePath}" but no file exists there yet — skipping puzzle assignment until it's populated.`
      );
      return null;
    }
    if (error instanceof PuzzlePoolFormatError) {
      console.warn(`PUZZLE_POOL_PATH is set to "${filePath}" but ${error.message} — skipping puzzle assignment until it's rebuilt.`);
      return null;
    }
    throw error;
  }
}

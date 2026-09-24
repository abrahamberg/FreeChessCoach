import { scanRealisticThreats, type AvailableMotifScan } from '@freechesscoach/chess-analysis';
import type { EngineLine } from '@freechesscoach/shared';

/** The realistic threat scan per eval index. */
export type RealisticScanCache = Map<number, AvailableMotifScan>;

/**
 * `scanRealisticThreats(fen, lines)`, remembered by eval index. The PV walk
 * and the realistic-threat filter are both pure in (fen, lines), and every
 * position is scanned as one move's "after" and, two plies later, the next
 * one's "before", so each position is walked at most once. A rank the filter
 * would drop is never walked (`scanRealisticThreats`). `onScan` is called
 * on a cache miss only.
 */
export function cachedRealisticScan(
  cache: RealisticScanCache,
  evalIndex: number,
  fen: string,
  lines: readonly EngineLine[],
  onScan?: (evalIndex: number) => void
): AvailableMotifScan {
  const cached = cache.get(evalIndex);
  if (cached) return cached;
  onScan?.(evalIndex);
  const scan = scanRealisticThreats(fen, lines);
  cache.set(evalIndex, scan);
  return scan;
}

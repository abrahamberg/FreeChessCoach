import type { ParsedPosition } from './pgn.js';
import { planPassScans, type PassScanWant } from './pass-scan.js';
import { zugzwangWant } from './zugzwang-scan.js';

/** Every consumer of the pass scan. A tactic that needs the pass eval of some
 * plies adds its `PassScanWant` here and reads the result with `passEvalOf`;
 * plies that two wants share are searched once (see `pass-scan.ts`). */
export const PASS_SCAN_WANTS: PassScanWant[] = [zugzwangWant];

/** The flipped positions the engine must scan for this game. */
export function gamePassScanFens(positions: readonly ParsedPosition[]): string[] {
  return planPassScans(positions, PASS_SCAN_WANTS);
}

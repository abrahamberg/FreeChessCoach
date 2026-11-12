import type { EngineLine } from '@freechesscoach/shared';
import { toEngineLine } from '../../engine/browser-analyze.js';
import { getSharedEngineWorker } from '../../engine/shared-engine-worker-instance.js';
import type { EngineLinesSource } from '../live-review/engine-lines-source.js';
import type { ReviewEngineSwitch } from './review-engine-switch.js';
import { analyzeOnServer } from './server-review-engine.js';

/** Same search as the server's `/api/positions/hint-moves`: depth 12, three lines. */
const EXPLORE_DEPTH = 12;
const EXPLORE_LINES = 3;

/** Explore's engine lines from the engine on this device, for a page with no account. */
export const browserEngineLines: EngineLinesSource = async (fen: string): Promise<EngineLine[]> => {
  const lines = await getSharedEngineWorker().analyze({ fen, depth: EXPLORE_DEPTH, multiPv: EXPLORE_LINES });
  return lines.map((line) => toEngineLine(fen, line));
};

/** Explore on the free review follows the review's engine: the server's
 * while the review runs there (the device engine may never have loaded),
 * this device's otherwise or when the server says no. */
export function freeReviewEngineLines(engines: ReviewEngineSwitch): EngineLinesSource {
  return async (fen) => {
    if (engines.status.engine !== 'server') return browserEngineLines(fen);
    try {
      const [evaluation] = await analyzeOnServer([fen], EXPLORE_LINES);
      return evaluation?.lines ?? [];
    } catch {
      return browserEngineLines(fen);
    }
  };
}

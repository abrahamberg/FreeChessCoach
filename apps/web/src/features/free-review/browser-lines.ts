import type { EngineLine } from '@freechesscoach/shared';
import { toEngineLine } from '../../engine/browser-analyze.js';
import { getSharedEngineWorker } from '../../engine/shared-engine-worker-instance.js';
import type { EngineLinesSource } from '../live-review/engine-lines-source.js';

/** Same search as the server's `/api/positions/hint-moves`: depth 12, three lines. */
const EXPLORE_DEPTH = 12;
const EXPLORE_LINES = 3;

/** Explore's engine lines from the engine on this device, for a page with no account. */
export const browserEngineLines: EngineLinesSource = async (fen: string): Promise<EngineLine[]> => {
  const lines = await getSharedEngineWorker().analyze({ fen, depth: EXPLORE_DEPTH, multiPv: EXPLORE_LINES });
  return lines.map((line) => toEngineLine(fen, line));
};

import type { ImportableGameSource } from '@freechesscoach/shared';
import type { FunnelSource } from '../../analytics/track.js';

/** Where a free review's game came from: what the funnel events report and
 * what saving it to an account sends to the import. */
export interface ReviewOrigin {
  source: FunnelSource;
  /** The site's own date for a picked game, kept for the import's fallback. */
  playedAt: string | null;
}

export const PASTED_ORIGIN: ReviewOrigin = { source: 'pgn', playedAt: null };

/** The import's name for each source: a pasted PGN is `paste`. */
export function importSourceOf(source: FunnelSource): ImportableGameSource {
  return source === 'pgn' ? 'paste' : source;
}

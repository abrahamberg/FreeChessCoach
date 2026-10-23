import type { PlayerColor, StoredGameReport } from '@freechesscoach/shared';
import type { GameResultForColour } from './endgame-score.js';
import type { GameSpeed } from './time-control.js';

/**
 * One analyzed game's worth of input the stats-dashboard aggregators
 * (Phase 27-28) need — pre-resolved by the API layer (the DB read and
 * `classifyTimeControl` call) so every aggregator here stays pure/I/O-free
 * per AGENTS rule 5. `gameReport` is the stored, moves-less report: every
 * aggregate reads its per-player fields (the opening-mistake count included,
 * `PlayerReport.openingMistakes`), so no caller has to decode the game's
 * annotated PGN to build one. */
export interface StatsEntry {
  gameReport: StoredGameReport;
  result: GameResultForColour;
  userColor: PlayerColor;
  playedAt: Date | null;
  speed: GameSpeed;
}

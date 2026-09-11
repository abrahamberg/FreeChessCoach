import type { GameReport, PlayerColor } from '@freechesscoach/shared';
import type { GameResultForColour } from './endgame-score.js';
import type { GameSpeed } from './time-control.js';

/**
 * One analyzed game's worth of input the stats-dashboard aggregators
 * (Phase 27-28) need — pre-resolved by the API layer (the DB read and
 * `classifyTimeControl` call) so every aggregator here stays pure/I/O-free
 * per AGENTS rule 5. `gameReport` is the full, composed `GameReport` — moves
 * included — since `aggregate-opening-stats.ts`'s `openingMistakeCount`
 * genuinely reads `.moves` (opening-phase mistake counting); the API layer
 * composes it from `StoredGameReport` + `annotatedPgn`
 * (`services/game-report.ts`'s `composeGameReport`) before building this. */
export interface StatsEntry {
  gameReport: GameReport;
  result: GameResultForColour;
  userColor: PlayerColor;
  playedAt: Date | null;
  speed: GameSpeed;
}

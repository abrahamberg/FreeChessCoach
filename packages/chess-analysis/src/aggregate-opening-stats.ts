import { openingMistakeCount } from './opening-mistakes.js';
import type { StatsEntry } from './stats-entry.js';

const UNKNOWN_OPENING = 'Unknown opening';

export interface OpeningPerformanceRow {
  opening: string;
  gamesPlayed: number;
  winPct: number;
  accuracy: number;
}

export interface OpeningStats {
  averageBookMoves: number | null;
  openingAccuracy: number | null;
  averageOpeningMistakes: number | null;
  performanceByOpening: OpeningPerformanceRow[];
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;
}

function resultPoints(result: StatsEntry['result']): number {
  if (result === 'win') return 1;
  if (result === 'draw') return 0.5;
  return 0;
}

function openingNameFor(entry: StatsEntry): string {
  return entry.gameReport.book.name ?? entry.gameReport.book.eco ?? UNKNOWN_OPENING;
}

function buildPerformanceByOpening(entries: StatsEntry[]): OpeningPerformanceRow[] {
  const groups = new Map<string, StatsEntry[]>();
  for (const entry of entries) {
    const name = openingNameFor(entry);
    const group = groups.get(name);
    if (group) group.push(entry);
    else groups.set(name, [entry]);
  }

  const rows = Array.from(groups.entries()).map(([opening, groupEntries]) => ({
    opening,
    gamesPlayed: groupEntries.length,
    winPct: (mean(groupEntries.map((entry) => resultPoints(entry.result))) ?? 0) * 100,
    accuracy: mean(groupEntries.map((entry) => entry.gameReport.players[entry.userColor].accuracy)) ?? 0
  }));

  return rows.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
}

/** Cross-game opening breakdown (Task 27.2) — mirrors chess.com's Opening
 * Statistics: average book depth, opening-phase accuracy, mistake rate, and
 * a per-opening performance table. */
export function aggregateOpeningStats(entries: StatsEntry[]): OpeningStats {
  const bookMoves = entries.map((entry) => entry.gameReport.book.players[entry.userColor].lastBookPly);
  const openingAccuracies = entries
    .map((entry) => entry.gameReport.players[entry.userColor].phaseAccuracy.opening)
    .filter((value): value is number => value !== null);
  const openingMistakes = entries.map((entry) =>
    openingMistakeCount(entry.gameReport.moves, entry.userColor)
  );

  return {
    averageBookMoves: mean(bookMoves),
    openingAccuracy: mean(openingAccuracies),
    averageOpeningMistakes: mean(openingMistakes),
    performanceByOpening: buildPerformanceByOpening(entries)
  };
}

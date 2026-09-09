import {
  TACTIC_MOTIF_TYPES,
  type TacticBaselineKind,
  type TacticBaselineNoteDto,
  type TacticBaselineTone,
  type TacticMotifCounts,
  type TacticMotifType
} from '@freechesscoach/shared';
import { CONFIG } from './config.js';

/**
 * Layer 5 of `docs/tactics-rework.md` §5: compare one game's tactic tally
 * against the player's own history and say what stands out.
 *
 * The aggregate this reads has been computed since the stats dashboard
 * shipped and nothing consumed it for copy, which is why every game-level
 * tactic line the review showed was measured against zero — "Tactics: 1
 * allowed" is a fact about the game and nothing about the player.
 *
 * Pure and I/O-free: the caller fetches the history (see
 * `apps/api/src/services/stats-dashboard.ts`) and hands both tallies over.
 */

export interface TacticBaselineInput {
  /** This game's counts for the player whose review it is. */
  game: TacticMotifCounts;
  /** The same counts summed across the player's **other** analysed games.
   * This game must not be in here: a lopsided game would otherwise partly
   * define the baseline it is being measured against, and the more lopsided
   * it is the more it flatters itself. */
  history: TacticMotifCounts;
  /** How many games `history` covers. */
  historyGames: number;
}

/** How many chances of `kind` a tally offers, and how many went the wrong
 * (or, for `found`, the right) way. */
interface Tally {
  chances: number;
  hits: number;
}

function tallyFor(counts: TacticMotifCounts, motif: TacticMotifType, kind: TacticBaselineKind): Tally {
  const row = counts[motif];
  if (kind === 'allowed') {
    // `preventable`/`prevented` are absent, not zero, on a report stored
    // before they were computed — treating absent as zero would invent a
    // perfect record out of missing data.
    const chances = row.preventable ?? 0;
    return { chances, hits: chances - (row.prevented ?? 0) };
  }
  if (kind === 'found') return { chances: row.opportunities, hits: row.found };
  return { chances: row.opportunities, hits: row.opportunities - row.found };
}

/**
 * Every motif where this game is far enough from the player's usual to be
 * worth saying, best first.
 *
 * "Best" is the deviation weighted by how many chances the game actually
 * gave: missing one fork out of one is a bigger *rate* than missing three
 * out of five and a much smaller story.
 */
export function compareGameToTacticBaseline(input: TacticBaselineInput): TacticBaselineNoteDto[] {
  const notes: TacticBaselineNoteDto[] = [];

  for (const motif of TACTIC_MOTIF_TYPES) {
    for (const kind of ['missed', 'allowed', 'found'] as const) {
      const note = noteFor(input, motif, kind);
      if (note) notes.push(note);
    }
  }
  return notes.sort((left, right) => weightOf(right) - weightOf(left));
}

/** The one note a game-level card leads with, or `null` when nothing in this
 * game stands out against the player's own record. */
export function headlineTacticBaselineNote(input: TacticBaselineInput): TacticBaselineNoteDto | null {
  return compareGameToTacticBaseline(input)[0] ?? null;
}

function noteFor(input: TacticBaselineInput, motif: TacticMotifType, kind: TacticBaselineKind): TacticBaselineNoteDto | null {
  const game = tallyFor(input.game, motif, kind);
  if (game.chances === 0) return null;

  const baseline = tallyFor(input.history, motif, kind);
  if (input.historyGames < CONFIG.tacticBaseline.minBaselineGames) return null;
  if (baseline.chances < CONFIG.tacticBaseline.minBaselineChances) return null;

  const gameRate = game.hits / game.chances;
  const baselineRate = baseline.hits / baseline.chances;
  if (gameRate - baselineRate < CONFIG.tacticBaseline.noteworthyGap) return null;

  return {
    motif,
    kind,
    tone: toneFor(kind, baselineRate),
    gameRate,
    baselineRate,
    gameChances: game.chances,
    baselineChances: baseline.chances,
    baselineGames: input.historyGames
  };
}

/** A lapse against a good record is a note; the same lapse against a record
 * that already shows it is the thing to train. The good direction is neither. */
function toneFor(kind: TacticBaselineKind, baselineRate: number): TacticBaselineTone {
  if (kind === 'found') return 'strength';
  return baselineRate >= CONFIG.tacticBaseline.habitBaselineRate ? 'habit' : 'unusual';
}

/** Deviation, weighted by how many chances the game gave — the same rate off
 * one chance is a coincidence and off six is a story. */
function weightOf(note: TacticBaselineNoteDto): number {
  return (note.gameRate - note.baselineRate) * Math.sqrt(note.gameChances);
}

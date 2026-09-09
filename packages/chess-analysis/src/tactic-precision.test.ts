import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { classifyTacticMotif } from './classify-tactic-motif.js';

/**
 * The precision half of the tactic-detector test suite.
 *
 * `tactic-detectors/lichess-puzzle-validation.test.ts` measures **recall**:
 * on a real tactic, do we ever produce the right label? Nothing measured the
 * other direction — how often we produce a label when there is no tactic —
 * so a detector that fires on everything scored a perfect 40/40 there and
 * shipped. See `docs/tactics-rework.md` §2 for the investigation.
 *
 * Both corpora below are chosen so that a motif is *usually* the wrong
 * answer, which is what makes a label rate meaningful as a false-positive
 * proxy:
 *
 * - **Opening theory** (`data/openings.tsv`): main lines of named
 *   variations. Theory is not tactics; a fianchetto is not a skewer.
 * - **Quiet moves in sharp positions** (`data/lichess-puzzle-motifs.csv`):
 *   the non-capturing, non-checking legal moves that are *not* the puzzle's
 *   solution. Harder than opening theory — these positions really are sharp
 *   — so its ceiling is looser.
 *
 * Every threshold is the exact measured value plus a hair, in the same
 * spirit as the recall suite's `MIN_PASS`: these are regression guards, not
 * claims that the current numbers are acceptable. Each one records the
 * target it must ratchet down to. Lower a ceiling in the same commit that
 * earns it.
 */

// 400 lines / 4,332 plies. Measured: 640 labelled = 14.77%.
// Target after docs/tactics-rework.md phase B: <= 5%.
const OPENING_LINES = 400;
const OPENING_LABEL_RATE_CEILING = 0.15;

// Of those plies, the recaptures. Measured: 97 of 113 = 85.8%.
// A recapture is the most ordinary move in chess and is almost never a
// tactic, which makes this the sharpest single signal in the file.
// Target after phase B: <= 5%.
const RECAPTURE_LABEL_RATE_CEILING = 0.87;

// 120 puzzle positions / 3,040 quiet moves. Measured: 897 labelled = 29.51%.
// Target after phase B: <= 10%.
const PUZZLE_POSITIONS = 120;
const QUIET_MOVE_LABEL_RATE_CEILING = 0.30;

interface OpeningLine {
  name: string;
  uci: string[];
}

function loadOpeningLines(): OpeningLine[] {
  const path = fileURLToPath(new URL('../data/openings.tsv', import.meta.url));
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.split('\t'))
    .map((columns) => ({ name: columns[1] ?? '', uci: (columns[3] ?? '').split(' ') }))
    // Deep lines only: the first few plies of every opening are the same
    // handful of moves, so short lines would weight the corpus towards
    // 1.e4/1.d4 many times over.
    .filter((line) => line.uci.length >= 8)
    .slice(0, OPENING_LINES);
}

function loadPuzzlePositions(): { fen: string; solutionUci: string }[] {
  const path = fileURLToPath(new URL('../data/lichess-puzzle-motifs.csv', import.meta.url));
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.split(','))
    .map((columns) => ({ fen: columns[3] ?? '', solutionUci: (columns[4] ?? '').split(' ')[0] ?? '' }))
    .slice(0, PUZZLE_POSITIONS);
}

function moverOf(board: Chess): 'white' | 'black' {
  return board.turn() === 'w' ? 'white' : 'black';
}

/** Same call `build-game-report.ts` makes, with `isTacticalPosition` false:
 * the `'other'` catch-all is a deliberate "this position was sharp and we
 * can't name why" label, not a false positive, so it is kept out of the
 * count either way. */
function labelFor(fenBefore: string, moveSan: string, mover: 'white' | 'black', isCheckmate: boolean): string | null {
  return classifyTacticMotif({ fenBefore, moveSan, mover, quality: 'best', isCheckmate, isTacticalPosition: false });
}

interface OpeningTally {
  plies: number;
  labelled: number;
  recaptures: number;
  labelledRecaptures: number;
  byType: Map<string, number>;
  examples: string[];
}

function scanOpeningTheory(): OpeningTally {
  const tally: OpeningTally = { plies: 0, labelled: 0, recaptures: 0, labelledRecaptures: 0, byType: new Map(), examples: [] };

  for (const line of loadOpeningLines()) {
    const board = new Chess();
    let lastCaptureSquare: string | null = null;

    for (const uci of line.uci) {
      const fenBefore = board.fen();
      const mover = moverOf(board);
      const move = playUci(board, uci);
      if (!move) break;

      tally.plies += 1;
      const isRecapture = move.captured !== undefined && move.to === lastCaptureSquare;
      if (isRecapture) tally.recaptures += 1;

      const label = labelFor(fenBefore, move.san, mover, board.isCheckmate());
      if (label) {
        tally.labelled += 1;
        tally.byType.set(label, (tally.byType.get(label) ?? 0) + 1);
        if (isRecapture) tally.labelledRecaptures += 1;
        // One example per opening, so a single gambit line with six
        // captures in it can't fill the whole list.
        const alreadyShown = tally.examples.some((example) => example.endsWith(`(${line.name})`));
        if (tally.examples.length < 8 && !alreadyShown) tally.examples.push(`${move.san} → ${label} (${line.name})`);
      }
      lastCaptureSquare = move.captured !== undefined ? move.to : null;
    }
  }
  return tally;
}

function playUci(board: Chess, uci: string): { san: string; to: string; captured?: string } | null {
  try {
    return board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
  } catch {
    return null;
  }
}

interface QuietTally {
  moves: number;
  labelled: number;
  byType: Map<string, number>;
}

/** Non-capturing, non-checking legal moves that aren't the puzzle's own
 * solution — the closest thing to "a move nothing interesting happens on"
 * that a sharp position offers. */
function scanQuietMoves(): QuietTally {
  let moves = 0;
  let labelled = 0;
  const byType = new Map<string, number>();

  for (const position of loadPuzzlePositions()) {
    const board = new Chess(position.fen);
    const mover = moverOf(board);

    for (const move of board.moves({ verbose: true })) {
      if (`${move.from}${move.to}${move.promotion ?? ''}` === position.solutionUci) continue;
      if (move.captured !== undefined || move.san.includes('+') || move.san.includes('#')) continue;

      moves += 1;
      const label = labelFor(position.fen, move.san, mover, false);
      if (label) {
        labelled += 1;
        byType.set(label, (byType.get(label) ?? 0) + 1);
      }
    }
  }
  return { moves, labelled, byType };
}

function describeTypes(byType: Map<string, number>, total: number): string {
  return [...byType]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type} ${count} (${((count / total) * 100).toFixed(1)}%)`)
    .join(', ');
}

/** Both corpora are walked once and shared, lazily: at `describe` scope they
 * would run during collection, so filtering down to a single test in this
 * file would still pay for both scans. */
let openingScan: OpeningTally | undefined;
function openingTheory(): OpeningTally {
  openingScan ??= scanOpeningTheory();
  return openingScan;
}

let quietScan: QuietTally | undefined;
function quietMoves(): QuietTally {
  quietScan ??= scanQuietMoves();
  return quietScan;
}

describe('classifyTacticMotif precision', () => {
  test('names a tactic on only a minority of opening theory moves', () => {
    const opening = openingTheory();
    const rate = opening.labelled / opening.plies;
    expect(opening.plies, 'corpus shrank — the ceiling below is calibrated to its size').toBeGreaterThan(4000);
    expect(
      rate,
      `${opening.labelled}/${opening.plies} theory moves labelled. By type: ${describeTypes(opening.byType, opening.plies)}. ` +
        `Examples: ${opening.examples.join(' · ')}`
    ).toBeLessThanOrEqual(OPENING_LABEL_RATE_CEILING);
  });

  test('rarely calls a recapture a tactic', () => {
    const opening = openingTheory();
    const rate = opening.labelledRecaptures / opening.recaptures;
    expect(opening.recaptures, 'too few recaptures in the corpus to measure').toBeGreaterThan(50);
    expect(
      rate,
      `${opening.labelledRecaptures}/${opening.recaptures} recaptures in opening theory carry a tactic label`
    ).toBeLessThanOrEqual(RECAPTURE_LABEL_RATE_CEILING);
  });

  test('names a tactic on only a minority of quiet moves in sharp positions', () => {
    const quiet = quietMoves();
    const rate = quiet.labelled / quiet.moves;
    expect(quiet.moves, 'corpus shrank — the ceiling below is calibrated to its size').toBeGreaterThan(2500);
    expect(
      rate,
      `${quiet.labelled}/${quiet.moves} quiet moves labelled. By type: ${describeTypes(quiet.byType, quiet.moves)}`
    ).toBeLessThanOrEqual(QUIET_MOVE_LABEL_RATE_CEILING);
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess, type Square } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { verifyTacticClaims } from '../verify-tactic-claims.js';
import { buildTacticDetectionContext, type PreviousMove } from './context.js';
import { proposeTacticClaims, TACTIC_DETECTORS } from './registry.js';

/**
 * Every registered detector has to be able to fire.
 *
 * A detector whose gates can never all be true is dead code that still costs
 * a scan of every move, and the unit test next to it can't catch that: a
 * hand-built fixture proves the detector works on the position its author had
 * in mind, not that the position ever occurs. Walking real games is what
 * closes that gap — and it caught one: `windmill`'s first definition asked
 * for the grinder to capture *and* uncover the same check twice in two plies,
 * which never happens, and is now the cycle it actually is.
 *
 * The motifs below are the ones a 360-puzzle sample genuinely doesn't
 * contain. Each has a hand-built fixture in its own test file, named here so
 * this list can't quietly become a place to park a broken detector — and the
 * second test below fails if one of them turns out not to be rare after all,
 * which is how `windmill` came off it.
 */
const RARE_IN_PUZZLES = new Set([
  'smotheredMate', // mating-patterns.test.ts
  'matingNet', // mating-patterns.test.ts
  'underPromotion', // promotion.test.ts
  'decoy', // decoy.test.ts
  'stalemateResource', // draw-resources.test.ts
  'simplifiesToDraw' // draw-resources.test.ts
]);

interface PuzzleRow {
  fen: string;
  moves: string[];
}

function loadPuzzles(): PuzzleRow[] {
  const path = fileURLToPath(new URL('../../data/lichess-puzzle-motifs.csv', import.meta.url));
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.split(','))
    .map((columns) => ({ fen: columns[3] ?? '', moves: (columns[4] ?? '').split(' ') }));
}

/** Every motif claimed anywhere in the sampled solutions, both sides' moves
 * included — the opponent's setup move is where most of the defensive family
 * shows up. */
function motifsClaimedAcrossPuzzles(): Set<string> {
  const claimed = new Set<string>();

  for (const puzzle of loadPuzzles()) {
    let fen = puzzle.fen;
    let previous: PreviousMove | null = null;

    for (const uci of puzzle.moves) {
      const board = new Chess(fen);
      const mover: 'white' | 'black' = board.turn() === 'w' ? 'white' : 'black';
      let move;
      try {
        move = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
      } catch {
        break;
      }
      if (!move) break;

      const context = buildTacticDetectionContext(fen, move.san, mover, previous);
      for (const claim of verifyTacticClaims(context, proposeTacticClaims(context))) claimed.add(claim.type);
      previous = { from: move.from as Square, to: move.to as Square, wasCapture: move.captured !== undefined };
      fen = board.fen();
    }
  }
  return claimed;
}

/** The corpus walk is shared and lazy: at `describe` scope it would run
 * during collection, so filtering down to one test in this file would still
 * pay for the whole scan. */
let scan: Set<string> | undefined;
function claimedMotifs(): Set<string> {
  scan ??= motifsClaimedAcrossPuzzles();
  return scan;
}

describe('every registered detector can actually fire', () => {
  test('each motif is either claimed somewhere in the puzzle corpus or listed as rare', () => {
    const claimed = claimedMotifs();
    const dead = TACTIC_DETECTORS.map((detector) => detector.type).filter(
      (type) => !claimed.has(type) && !RARE_IN_PUZZLES.has(type)
    );

    expect(dead, 'these detectors never fired on 360 real puzzles — check their gates').toEqual([]);
  });

  test('the rare list stays honest: nothing on it fires in the corpus after all', () => {
    // If one of these starts showing up, it isn't rare and belongs in the
    // measured set above rather than exempted from it.
    const claimed = claimedMotifs();
    const notActuallyRare = [...RARE_IN_PUZZLES].filter((type) => claimed.has(type));

    expect(notActuallyRare, 'move these off RARE_IN_PUZZLES — the corpus covers them').toEqual([]);
  });
});

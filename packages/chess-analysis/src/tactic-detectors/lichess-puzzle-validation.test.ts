import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import type { TacticMotifType } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { classifyTacticMotif } from '../classify-tactic-motif.js';

/**
 * Ground-truth check for `classifyTacticMotif` against real Lichess
 * puzzles, independently theme-tagged by Lichess (not by us) — unlike
 * every other test in this directory, which hand-constructs a synthetic
 * FEN with the same mental model as the detector it's testing, so it can
 * only catch a detector disagreeing with its own author. See
 * `../../scripts/build-lichess-puzzle-fixture.mjs` for how the fixture
 * (`../../data/lichess-puzzle-motifs.csv`) was sampled, and
 * `../../data/README.md` for the dataset version.
 *
 * For each puzzle, the fixture's `motif` is expected on *at least one* of
 * the solver's plies (not necessarily the first) — Lichess doesn't say
 * which move in a multi-move solution embodies the tagged theme.
 *
 * The pass thresholds below are the exact counts measured against this
 * fixture, not round numbers — this is a regression guard (a future change
 * that quietly makes a detector worse will fail it), not a claim that these
 * are "correct" scores. Three real, understood causes keep several of them
 * well under 40/40:
 *
 * 1. `classify-tactic-motif.ts` returns only the first (highest-priority)
 *    matching motif per ply, but a puzzle can genuinely embody more than
 *    one at once (e.g. a pin that's also technically a fork) — Lichess's
 *    multi-label tags don't hit this ceiling, our single-label classifier
 *    does. This mostly explains `pin`, `skewer`, and `discoveredAttack`
 *    landing below `fork`, which sits earlier in `TACTIC_DETECTORS`.
 * 2. `trappedPieceDetector` (`trapped-piece.ts`) fires on *any* opponent
 *    piece trapped anywhere on the board after the move, deliberately not
 *    scoped to whether this move caused or exploited that trap (see its
 *    own test's fixture, where an unrelated king move "detects" a
 *    pre-existing trap). At priority 50 it sits ahead of `freePiece` (60),
 *    so an incidental trapped piece elsewhere on the board can steal the
 *    classification from what Lichess tagged `hangingPiece` or
 *    `capturingDefender` — the likely reason those two land far below the
 *    others.
 * 3. `backRankMate` is excluded entirely by the fixture builder: it's
 *    almost always itself a forced mate, and `isCheckmate` is checked
 *    before the registry runs, so a puzzle tagged `backRankMate` can only
 *    ever come back `'checkmate'` here, never `'weakBackRank'`.
 */
const MIN_PASS: Partial<Record<string, number>> = {
  fork: 40,
  pin: 24,
  skewer: 33,
  discoveredAttack: 32,
  doubleCheck: 40,
  trappedPiece: 25,
  hangingPiece: 10,
  capturingDefender: 11,
  mateIn1: 40
};

interface FixtureRow {
  target: string;
  motif: TacticMotifType;
  puzzleId: string;
  fen: string;
  moves: string[];
}

function loadFixture(): FixtureRow[] {
  const path = fileURLToPath(new URL('../../data/lichess-puzzle-motifs.csv', import.meta.url));
  const lines = readFileSync(path, 'utf8').trim().split('\n');
  return lines.slice(1).map((line) => {
    const [target, motif, puzzleId, fen, moves] = line.split(',');
    return { target: target!, motif: motif as TacticMotifType, puzzleId: puzzleId!, fen: fen!, moves: moves!.split(' ') };
  });
}

/** Whether any of the solver's plies (odd indices — index 0 is the
 * opponent's setup move, per Lichess's puzzle format) classifies as
 * `expected`. */
function puzzleExhibitsMotif(row: FixtureRow): boolean {
  let fen = row.fen;
  for (let ply = 0; ply < row.moves.length; ply++) {
    const chess = new Chess(fen);
    const mover: 'white' | 'black' = chess.turn() === 'w' ? 'white' : 'black';
    const uci = row.moves[ply]!;
    let move;
    try {
      move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
    } catch {
      return false;
    }
    if (!move) return false;

    if (ply % 2 === 1) {
      const result = classifyTacticMotif({
        fenBefore: fen,
        moveSan: move.san,
        mover,
        quality: 'best',
        isCheckmate: chess.isCheckmate(),
        isTacticalPosition: true
      });
      if (result === row.motif) return true;
    }
    fen = chess.fen();
  }
  return false;
}

describe('classifyTacticMotif against real Lichess puzzles', () => {
  const fixture = loadFixture();
  const byTarget = new Map<string, FixtureRow[]>();
  for (const row of fixture) {
    const bucket = byTarget.get(row.target) ?? [];
    bucket.push(row);
    byTarget.set(row.target, bucket);
  }

  for (const [target, rows] of byTarget) {
    test(`agrees with Lichess's "${target}" tag on at least ${MIN_PASS[target]}/${rows.length} sampled puzzles`, () => {
      const failures = rows.filter((row) => !puzzleExhibitsMotif(row));
      const passCount = rows.length - failures.length;

      if (passCount < (MIN_PASS[target] ?? 0)) {
        const examples = failures.slice(0, 5).map((row) => row.puzzleId).join(', ');
        expect.fail(`${target}: only ${passCount}/${rows.length} passed (need >= ${MIN_PASS[target]}). First failing puzzle IDs: ${examples}`);
      }
      expect(passCount).toBeGreaterThanOrEqual(MIN_PASS[target] ?? 0);
    });
  }
});

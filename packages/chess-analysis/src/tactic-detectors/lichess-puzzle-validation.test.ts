import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess, type Square } from 'chess.js';
import type { TacticMotifType } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import type { PreviousMove } from './context.js';
import { classifyTacticClaims } from '../classify-tactic-motif.js';

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
 * Measured **multi-label**: the tagged theme has to appear among the move's
 * verified claims, not to win the single headline slot. That is the whole
 * point of `docs/tactics-rework.md` §5 layer 3 — the shipped classifier
 * returned the first match of a fixed priority list, and §2 measured that as
 * discarding up to 20 of 40 puzzles per theme (`forkDetector` sat at
 * priority 10 with a loose definition and ate everything below it). Real
 * tactics are multi-label; a knight fork that also skewers is both.
 *
 * The pass thresholds below are the exact counts measured against this
 * fixture, not round numbers — this is a regression guard (a future change
 * that quietly makes a detector worse will fail it), not a claim that these
 * are "correct" scores. Two structural reasons keep several of them under
 * 40/40:
 *
 * 1. `trappedPieces` (`tactic-trapped.ts`) deliberately never counts a
 *    pawn — a cornered pawn is just ordinary closed-position play, not a
 *    tactic — while Lichess's own `trappedPiece` tag does credit some
 *    puzzles for exactly that.
 * 2. `backRankMate` is excluded entirely by the fixture builder: it's
 *    almost always itself a forced mate, and `isCheckmate` is answered
 *    before any detector runs, so a puzzle tagged `backRankMate` can only
 *    ever come back `'checkmate'` here, never `'weakBackRank'`.
 */
const MIN_PASS: Partial<Record<string, number>> = {
  fork: 40,
  pin: 27,
  skewer: 40,
  discoveredAttack: 37,
  doubleCheck: 40,
  trappedPiece: 29,
  hangingPiece: 29,
  capturingDefender: 15,
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
  let previous: PreviousMove | null = null;

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

    if (ply % 2 === 1 && motifsOn(fen, move.san, mover, chess.isCheckmate(), previous).has(row.motif)) return true;
    previous = { from: move.from as Square, to: move.to as Square, wasCapture: move.captured !== undefined };
    fen = chess.fen();
  }
  return false;
}

/** Every motif the move carries: the headline (which can be `checkmate`,
 * answered before any detector runs) plus every verified claim alongside
 * it. */
function motifsOn(
  fenBefore: string,
  moveSan: string,
  mover: 'white' | 'black',
  isCheckmate: boolean,
  previous: PreviousMove | null
): Set<TacticMotifType> {
  const classification = classifyTacticClaims({
    fenBefore,
    moveSan,
    mover,
    quality: 'best',
    isCheckmate,
    isTacticalPosition: true,
    previous
  });
  const motifs = new Set<TacticMotifType>(classification.claims.map((claim) => claim.type));
  if (classification.headline) motifs.add(classification.headline);
  return motifs;
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

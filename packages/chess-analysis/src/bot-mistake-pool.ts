import { Chess, type Square } from 'chess.js';
import type { BotPersonality, DiagnosisCodeId } from '@freechesscoach/shared';
import type { BotCandidate } from './bot-candidate-weighting.js';
import { pickPersonalityWeightedMove } from './bot-candidate-weighting.js';
import { analyzeChecksCapturesThreats } from './checks-captures-threats.js';
import { CONFIG } from './config.js';
import { parsePgn } from './pgn.js';

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Priority bonus for a move that is one of the position's own
 * checks/captures/threats (offensive TTC) — set above the maximum single
 * piece value (queen = 9) so this pool is dominated by "plausible to
 * consider" (a human always notices "I can check/capture/threaten" first),
 * with defensive exposure only breaking ties among equally-plausible
 * candidates rather than ever displacing offensive relevance outright. */
const OFFENSIVE_TTC_PRIORITY = 10;

/** Bonus for a move that happens near the square the student just moved to —
 * the reflexes a weaker player really has: recapture right there, chase the
 * piece that just moved, answer the last move without weighing the rest of the
 * board. Below OFFENSIVE_TTC_PRIORITY, so a nearby quiet move never outranks a
 * check or capture elsewhere. */
const NEAR_LAST_MOVE_PRIORITY = 6;

export interface LastMove {
  from: string;
  to: string;
}

export interface MistakeBatcherInput {
  fen: string;
  /** One candidate per legal move — no engine score is needed to screen them. */
  candidates: BotCandidate[];
  /** The student's move that led here, when known. */
  lastMove: LastMove | null;
  personality: BotPersonality;
  /** This bot's documented weaknesses: a candidate that exhibits one is tried
   * before the others in its batch. */
  diagnosisCodes: readonly DiagnosisCodeId[];
  random: () => number;
}

export interface MistakeBatcher {
  /** The next batch of plausible mistakes, in the order to try them, or null
   * once `CONFIG.botMistake.batches` batches (or the legal moves) are used up. */
  next(): BotCandidate[] | null;
}

interface MoveGeometry {
  from: string;
  to: string;
}

/**
 * Screens a position for the mistakes a bot of this personality would plausibly
 * make, without asking the engine anything: legal moves ranked by tactical
 * plausibility (a check, capture or threat the position offers, plus how much
 * the move leaves the opponent to capture) and by nearness to what the student
 * just played, then handed out `batchSize` at a time. The engine only ever sees
 * the one candidate the caller picks from a batch (bot-mistake-search.ts).
 *
 * Cheap ranking (checks/captures/threats and nearness) picks the pool first;
 * the per-move "what could the opponent capture after this" scan — a board
 * replay each — runs only on that pool, not on every legal move.
 */
export function createMistakeBatcher(input: MistakeBatcherInput): MistakeBatcher {
  const { fen, candidates, lastMove, personality, diagnosisCodes, random } = input;
  const { batchSize, batches, nearDistance } = CONFIG.botMistake;
  const geometry = moveGeometry(fen);
  const offensive = offensiveMoves(fen);

  const cheap = candidates
    .map((candidate) => ({
      candidate,
      tiebreak: random(),
      priority:
        (offensive.has(candidate.moveSan) ? OFFENSIVE_TTC_PRIORITY : 0) +
        (isNear(geometry.get(candidate.moveSan), lastMove, nearDistance) ? NEAR_LAST_MOVE_PRIORITY : 0)
    }))
    .sort((a, b) => b.priority - a.priority || a.tiebreak - b.tiebreak)
    .slice(0, batchSize * batches);

  const ranked = cheap
    .map((entry) => ({ ...entry, priority: entry.priority + defensiveExposure(fen, entry.candidate.moveSan) }))
    .sort((a, b) => b.priority - a.priority || a.tiebreak - b.tiebreak)
    .map((entry) => entry.candidate);

  let handedOut = 0;
  return {
    next() {
      if (handedOut >= batches || handedOut * batchSize >= ranked.length) return null;
      const batch = ranked.slice(handedOut * batchSize, (handedOut + 1) * batchSize);
      handedOut += 1;
      return orderBatch(batch, personality, diagnosisCodes, random);
    }
  };
}

/** Weakness-matching candidates first, each group personality-weighted. */
function orderBatch(
  batch: BotCandidate[],
  personality: BotPersonality,
  diagnosisCodes: readonly DiagnosisCodeId[],
  random: () => number
): BotCandidate[] {
  const remaining = [...batch];
  const ordered: BotCandidate[] = [];
  while (remaining.length > 0) {
    const manifesting = remaining.filter((candidate) => candidate.diagnosisCodes.some((code) => diagnosisCodes.includes(code)));
    const picked = pickPersonalityWeightedMove(manifesting.length > 0 ? manifesting : remaining, personality, random);
    ordered.push(picked);
    remaining.splice(remaining.indexOf(picked), 1);
  }
  return ordered;
}

function moveGeometry(fen: string): Map<string, MoveGeometry> {
  const geometry = new Map<string, MoveGeometry>();
  for (const move of new Chess(fen).moves({ verbose: true })) geometry.set(move.san, { from: move.from, to: move.to });
  return geometry;
}

function offensiveMoves(fen: string): Set<string> {
  const cct = analyzeChecksCapturesThreats(fen);
  return new Set([
    ...cct.checks.moves.map((move) => move.moveSan),
    ...cct.captures.moves.map((move) => move.moveSan),
    ...cct.threats.moves.map((move) => move.moveSan)
  ]);
}

function isNear(move: MoveGeometry | undefined, lastMove: LastMove | null, distance: number): boolean {
  if (!move || !lastMove) return false;
  return squareDistance(move.to, lastMove.to) <= distance || squareDistance(move.from, lastMove.to) <= distance;
}

/** Chebyshev (king-move) distance between two squares. */
function squareDistance(a: string, b: string): number {
  return Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1])));
}

/** Total material value of everything the opponent could capture immediately
 * after `moveSan` — the "defensive TTC" half of plausibility: how much the move
 * leaves hanging. 0 for a SAN that does not parse or a move that leaves nothing
 * capturable. */
function defensiveExposure(fen: string, moveSan: string): number {
  let after: string;
  try {
    const chess = new Chess(fen);
    chess.move(moveSan);
    after = chess.fen();
  } catch {
    return 0;
  }
  return analyzeChecksCapturesThreats(after).captures.moves.reduce((sum, move) => sum + (PIECE_VALUES[move.capturedPiece] ?? 0), 0);
}

/** The squares a move went between, as a `LastMove` — from the position before
 * it and its SAN. Null when the SAN is not legal there. */
export function lastMoveOf(fenBefore: string, san: string): LastMove | null {
  try {
    const move = new Chess(fenBefore).move(san);
    return { from: move.from as Square, to: move.to as Square };
  } catch {
    return null;
  }
}

/** Every legal move at `fen`, in SAN. */
export function legalSanMoves(fen: string): string[] {
  return new Chess(fen).moves();
}

/** The position after `san` is played from `fen`, or null when it is not legal. */
export function fenAfterSan(fen: string, san: string): string | null {
  try {
    const chess = new Chess(fen);
    chess.move(san);
    return chess.fen();
  } catch {
    return null;
  }
}

/** The last move played in a game's PGN, as the squares it went between — null
 * for a game with no moves yet. */
export function lastMoveOfPgn(pgn: string): LastMove | null {
  const uci = parsePgn(pgn).positions.at(-1)?.moveUci;
  return uci && uci.length >= 4 ? { from: uci.slice(0, 2), to: uci.slice(2, 4) } : null;
}

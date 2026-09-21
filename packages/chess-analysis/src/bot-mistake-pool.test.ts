import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';
import type { BotPersonality } from '@freechesscoach/shared';
import type { BotCandidate } from './bot-candidate-weighting.js';
import { createMistakeBatcher, lastMoveOf } from './bot-mistake-pool.js';

const NEUTRAL: BotPersonality = { aggression: 0, trapSeeking: 0, defensiveness: 0 };
// After 1.e4 d5 — white to move: exd5 is a capture right where the student just
// played, Bb5+ a check two files away, and a3/h3 are quiet moves on the far wing.
const AFTER_D5 = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const D5_MOVE = { from: 'd7', to: 'd5' };

function candidate(moveSan: string, overrides: Partial<BotCandidate> = {}): BotCandidate {
  return {
    moveSan,
    cp: null,
    mateIn: null,
    createsFork: false,
    createsOpponentHangingPiece: false,
    createsUnderDefendedPiece: false,
    mobilityDelta: 0,
    forkInPlies: null,
    motif: null,
    diagnosisCodes: [],
    ...overrides
  };
}

function legalCandidates(fen: string, overrides: Record<string, Partial<BotCandidate>> = {}): BotCandidate[] {
  return new Chess(fen).moves().map((san) => candidate(san, overrides[san]));
}

function batcher(fen: string, overrides: Parameters<typeof legalCandidates>[1] = {}, extra: Partial<Parameters<typeof createMistakeBatcher>[0]> = {}) {
  return createMistakeBatcher({
    fen,
    candidates: legalCandidates(fen, overrides),
    lastMove: D5_MOVE,
    personality: NEUTRAL,
    diagnosisCodes: [],
    random: () => 0.5,
    ...extra
  });
}

function allBatches(source: ReturnType<typeof batcher>): string[][] {
  const out: string[][] = [];
  for (let batch = source.next(); batch; batch = source.next()) out.push(batch.map((move) => move.moveSan));
  return out;
}

describe('createMistakeBatcher', () => {
  test('hands out at most three batches of five distinct legal moves', () => {
    const batches = allBatches(batcher(AFTER_D5));
    const legal = new Set(new Chess(AFTER_D5).moves());

    expect(batches.map((batch) => batch.length)).toEqual([5, 5, 5]);
    const flat = batches.flat();
    expect(new Set(flat).size).toBe(15);
    expect(flat.every((san) => legal.has(san))).toBe(true);
  });

  test('the capture where the student just moved, and the nearby check, are screened before quiet moves on the far wing', () => {
    const [first] = allBatches(batcher(AFTER_D5));

    expect(first).toContain('exd5');
    expect(first).toContain('Bb5+');
    expect(first).not.toContain('a3');
    expect(first).not.toContain('h3');
  });

  test('with nothing tactical to go on, the first batch is moves near where the student just moved', () => {
    // The start position offers no checks or captures, so nearness to e5 decides.
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const [first] = allBatches(batcher(fen, {}, { lastMove: { from: 'e7', to: 'e5' } }));
    const geometry = new Map(new Chess(fen).moves({ verbose: true }).map((move) => [move.san, move]));

    const distanceToE5 = (square: string) => Math.max(Math.abs(square.charCodeAt(0) - 'e'.charCodeAt(0)), Math.abs(Number(square[1]) - 5));
    for (const san of first!) {
      const move = geometry.get(san)!;
      expect(Math.min(distanceToE5(move.to), distanceToE5(move.from))).toBeLessThanOrEqual(2);
    }
  });

  test('with no known last move, ranking is by tactical plausibility only', () => {
    const [first] = allBatches(batcher(AFTER_D5, {}, { lastMove: null }));

    expect(first).toContain('exd5');
  });

  test('a candidate exhibiting one of the bot\'s own weaknesses is tried first in its batch', () => {
    const [first] = allBatches(batcher(AFTER_D5, { 'Bb5+': { diagnosisCodes: ['BV-01'] } }, { diagnosisCodes: ['BV-01'] }));

    expect(first?.[0]).toBe('Bb5+');
  });

  test('an undocumented code on a candidate does not count as one of the bot\'s weaknesses', () => {
    const withOther = allBatches(batcher(AFTER_D5, { 'Bb5+': { diagnosisCodes: ['TA-07'] } }, { diagnosisCodes: ['BV-01'] }));
    const plain = allBatches(batcher(AFTER_D5));

    expect(withOther).toEqual(plain);
  });

  test('is deterministic for the same random source', () => {
    expect(allBatches(batcher(AFTER_D5))).toEqual(allBatches(batcher(AFTER_D5)));
  });

  test('a position with few legal moves runs out of batches early', () => {
    // Lone king in the corner: three legal moves.
    const fen = '7k/8/8/8/8/8/8/K7 w - - 0 1';
    const batches = allBatches(batcher(fen, {}, { lastMove: null }));

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
  });
});

describe('lastMoveOf', () => {
  test('gives the squares a move went between', () => {
    expect(lastMoveOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e4')).toEqual({ from: 'e2', to: 'e4' });
  });

  test('is null for a move that is not legal there', () => {
    expect(lastMoveOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e5')).toBeNull();
  });
});

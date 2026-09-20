import { describe, expect, test } from 'vitest';
import type { BotPersonality } from '@freechesscoach/shared';
import type { BotCandidate } from './bot-candidate-weighting.js';
import { BASELINE_LINES, decideBotBranch, drawBotRolls, linesNeeded, pickAnotherTopFive, playsBestMove, TOP_LINES } from './bot-move-pick.js';

const ODDS = { topFiveChance: 0.1, bestMoveGivenTopFiveChance: 0.5, mateConversionChance: 0.9, blunderGivenMissChance: 0.667 };
const NEUTRAL: BotPersonality = { aggression: 0, trapSeeking: 0, defensiveness: 0 };

function candidate(moveSan: string, mateIn: number | null = null): BotCandidate {
  return {
    moveSan,
    cp: 0,
    mateIn,
    createsFork: false,
    createsOpponentHangingPiece: false,
    createsUnderDefendedPiece: false,
    mobilityDelta: 0,
    forkInPlies: null,
    motif: null,
    diagnosisCodes: []
  };
}

describe('drawBotRolls', () => {
  test('draws exactly three values, in order, whatever branch follows', () => {
    const values = [0.11, 0.22, 0.33, 0.44];
    let index = 0;

    const rolls = drawBotRolls(() => values[index++]!);

    expect(rolls).toEqual({ r1: 0.11, r2: 0.22, r3: 0.33 });
    expect(index).toBe(3);
  });
});

describe('decideBotBranch', () => {
  test('a roll under the top-moves chance is the top branch and carries the %B roll', () => {
    expect(decideBotBranch({ r1: 0.05, r2: 0.4, r3: 0.9 }, ODDS)).toEqual({ kind: 'top', r2: 0.4 });
  });

  test('a miss is a blunder when the %C roll is under the blunder chance, otherwise a tactical mistake', () => {
    expect(decideBotBranch({ r1: 0.5, r2: 0, r3: 0.66 }, ODDS)).toEqual({ kind: 'miss', wanted: 'blunder' });
    expect(decideBotBranch({ r1: 0.5, r2: 0, r3: 0.7 }, ODDS)).toEqual({ kind: 'miss', wanted: 'mistake' });
  });

  test('a roll exactly at the top-moves chance is a miss', () => {
    expect(decideBotBranch({ r1: 0.1, r2: 0, r3: 0 }, ODDS).kind).toBe('miss');
  });
});

describe('linesNeeded', () => {
  test('top-moves asks for five lines, a miss for one', () => {
    expect(linesNeeded({ kind: 'top', r2: 0 })).toBe(TOP_LINES);
    expect(linesNeeded({ kind: 'miss', wanted: 'blunder' })).toBe(BASELINE_LINES);
    expect([TOP_LINES, BASELINE_LINES]).toEqual([5, 1]);
  });
});

describe('playsBestMove', () => {
  test('plays the best move when the %B roll is under its chance', () => {
    expect(playsBestMove(0.4, candidate('e4'), ODDS)).toBe(true);
    expect(playsBestMove(0.6, candidate('e4'), ODDS)).toBe(false);
  });

  test('a mate for the mover raises the chance to the mate-conversion floor', () => {
    expect(playsBestMove(0.8, candidate('Qh7#', 1), ODDS)).toBe(true);
    expect(playsBestMove(0.8, candidate('Qh7', -1), ODDS)).toBe(false);
  });
});

describe('pickAnotherTopFive', () => {
  test('never returns the best move and only looks at lines two to five', () => {
    const lines = ['a', 'b', 'c', 'd', 'e', 'f'].map((san) => candidate(san));

    for (const roll of [0, 0.3, 0.6, 0.99]) {
      const picked = pickAnotherTopFive(lines, NEUTRAL, () => roll);
      expect(['b', 'c', 'd', 'e']).toContain(picked?.moveSan);
    }
  });

  test('is null when the engine returned only one line', () => {
    expect(pickAnotherTopFive([candidate('a')], NEUTRAL, () => 0)).toBeNull();
  });
});

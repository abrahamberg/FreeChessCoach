import { TACTIC_MOTIF_TYPES, type TacticMotifCounts } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { compareGameToTacticBaseline, headlineTacticBaselineNote, type TacticBaselineInput } from './tactic-baseline.js';

type Row = { opportunities: number; found: number; preventable?: number; prevented?: number };

function counts(overrides: Partial<Record<string, Row>> = {}): TacticMotifCounts {
  const base = Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }]));
  return { ...base, ...overrides } as TacticMotifCounts;
}

/** Nine earlier games in which the player found nine forks out of ten, and
 * this game, in which they found neither of two. */
function missedForksInAnOtherwiseGoodRecord(): TacticBaselineInput {
  return {
    game: counts({ fork: { opportunities: 2, found: 0 } }),
    history: counts({ fork: { opportunities: 10, found: 9 } }),
    historyGames: 9
  };
}

describe('compareGameToTacticBaseline', () => {
  test('measures the game against the player\'s other games', () => {
    // The caller excludes this game from the history: a lopsided game would
    // otherwise partly define the baseline it is being measured against.
    const [note] = compareGameToTacticBaseline(missedForksInAnOtherwiseGoodRecord());

    expect(note).toMatchObject({ motif: 'fork', kind: 'missed', gameRate: 1, gameChances: 2, baselineChances: 10 });
    expect(note?.baselineRate).toBeCloseTo(0.1);
    expect(note?.baselineGames).toBe(9);
  });

  test('a lapse against a good record is unusual; the same lapse against a bad one is a habit', () => {
    const unusual = headlineTacticBaselineNote(missedForksInAnOtherwiseGoodRecord());
    const habit = headlineTacticBaselineNote({
      game: counts({ fork: { opportunities: 2, found: 0 } }),
      history: counts({ fork: { opportunities: 10, found: 5 } }),
      historyGames: 9
    });

    expect(unusual?.tone).toBe('unusual');
    expect(habit?.tone).toBe('habit');
  });

  test('says nothing when the game matches the player\'s usual rate', () => {
    const notes = compareGameToTacticBaseline({
      game: counts({ fork: { opportunities: 2, found: 2 } }),
      history: counts({ fork: { opportunities: 10, found: 9 } }),
      historyGames: 9
    });

    expect(notes.filter((note) => note.kind === 'missed')).toEqual([]);
  });

  test('says nothing at all without enough history to compare against', () => {
    expect(
      compareGameToTacticBaseline({
        game: counts({ fork: { opportunities: 2, found: 0 } }),
        history: counts({ fork: { opportunities: 3, found: 1 } }),
        historyGames: 2
      })
    ).toEqual([]);
  });

  test('treats absent preventable counts as missing data, not as a perfect record', () => {
    // `preventable`/`prevented` are undefined on reports stored before they
    // were computed; counting those as zero-allowed would invent a record.
    const notes = compareGameToTacticBaseline({
      game: counts({ fork: { opportunities: 0, found: 0, preventable: 2, prevented: 0 } }),
      history: counts({ fork: { opportunities: 0, found: 0 } }),
      historyGames: 9
    });

    expect(notes).toEqual([]);
  });

  test('credits the good direction too', () => {
    const note = headlineTacticBaselineNote({
      game: counts({ fork: { opportunities: 3, found: 3 } }),
      history: counts({ fork: { opportunities: 10, found: 2 } }),
      historyGames: 9
    });

    expect(note).toMatchObject({ kind: 'found', tone: 'strength' });
  });

  test('ranks a story about six chances above the same rate off one', () => {
    const notes = compareGameToTacticBaseline({
      game: counts({ fork: { opportunities: 1, found: 0 }, pin: { opportunities: 6, found: 0 } }),
      history: counts({ fork: { opportunities: 10, found: 9 }, pin: { opportunities: 10, found: 9 } }),
      historyGames: 9
    });

    expect(notes[0]?.motif).toBe('pin');
  });
});

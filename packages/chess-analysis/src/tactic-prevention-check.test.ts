import type { EngineLine } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { findDefusedThreat } from './tactic-prevention-check.js';

const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
const ROOK_MOVED_AWAY_FEN = '4k3/8/8/8/2N5/8/8/K7 w - - 0 1';
const KNIGHT_MOVED_AWAY_FEN = '4k3/1r6/8/8/8/2N5/8/K7 w - - 0 1';

const FORK_LINE: EngineLine = { moveUci: 'c4d6', moveSan: 'Nd6+', cp: 500, mateIn: null };
const QUIET_LINE: EngineLine = { moveUci: 'a1b1', moveSan: 'Kb1', cp: 0, mateIn: null };

describe('findDefusedThreat', () => {
  test('returns the motif when a line\'s tactic is gone by the after position (target moved away)', () => {
    const result = findDefusedThreat(FORK_FEN, ROOK_MOVED_AWAY_FEN, 'white', [FORK_LINE]);
    expect(result).toBe('fork');
  });

  test('returns the motif when the line is no longer even legal at the after position', () => {
    const result = findDefusedThreat(FORK_FEN, KNIGHT_MOVED_AWAY_FEN, 'white', [FORK_LINE]);
    expect(result).toBe('fork');
  });

  test('returns null when the tactic is still present after (nothing changed)', () => {
    const result = findDefusedThreat(FORK_FEN, FORK_FEN, 'white', [FORK_LINE]);
    expect(result).toBeNull();
  });

  test('returns null when no candidate line has a motif to begin with', () => {
    const result = findDefusedThreat(FORK_FEN, FORK_FEN, 'white', [QUIET_LINE]);
    expect(result).toBeNull();
  });

  test('handles an empty candidate list without throwing', () => {
    expect(findDefusedThreat(FORK_FEN, ROOK_MOVED_AWAY_FEN, 'white', [])).toBeNull();
  });

  test('checks lines in order and returns on the first defused one', () => {
    const result = findDefusedThreat(FORK_FEN, ROOK_MOVED_AWAY_FEN, 'white', [QUIET_LINE, FORK_LINE]);
    expect(result).toBe('fork');
  });
});

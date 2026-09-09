import type { EngineLine } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { findDefusedThreats, scanThreatOutcome } from './tactic-prevention-check.js';

const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
const ROOK_MOVED_AWAY_FEN = '4k3/8/8/8/2N5/8/8/K7 w - - 0 1';

const FORK_LINE: EngineLine = { moveUci: 'c4d6', moveSan: 'Nd6+', cp: 500, mateIn: null };
const QUIET_LINE: EngineLine = { moveUci: 'a1b1', moveSan: 'Kb1', cp: 0, mateIn: null };

// Same fork setup as pv-tactics.test.ts/available-motifs-scan.test.ts: white
// knight f4-d5 forks the black rook on b6 and knight on f6 (with the c4 pawn
// defending d5 and the d6 pawn blocking the rook's guard of f6), but only once
// the black king has stepped to e7 (ply 2) — the fork itself only appears at
// ply 3. Impossible for the old ply-1-only findDefusedThreat to ever detect.
const FORK_SETUP_FEN = '4k3/8/1r1p1n2/8/2P2N2/8/8/7K w - - 0 1';
const FORK_IN_3_PV = ['Kh2', 'Ke7', 'Nd5+'];
const FORK_IN_3_LINE: EngineLine = { moveUci: 'h1h2', moveSan: 'Kh2', cp: 0, mateIn: null, pvSan: FORK_IN_3_PV };
// Same setup with both non-king fork targets removed: after Ke7 (ply 2) the
// ply-3 knight check only attacks the king itself (a knight "fork" needs 2+
// targets), no longer qualifying as a fork.
const FORK_IN_3_DEFUSED_FEN = '4k3/8/3p4/8/2P2N2/8/8/7K w - - 0 1';

// A second, independent board with two simultaneously-available tactic
// motifs (Nd6+ forking the king and the b7 rook, plus a free undefended pawn
// on d3, isolated from each other so capturing the pawn doesn't also trigger
// removesDefender on the rook) — used to prove a single "after" scan can
// defuse more than one motif type at once. Moving the rook to d8 defuses
// both at once: the knight check then has only the king to hit, and the rook
// guards d3 down the open file.
const TWO_MOTIF_FEN = '4k3/1r6/8/8/2N5/3p4/8/3Q3K w - - 0 1';
const TWO_MOTIF_DEFUSED_FEN = '3rk3/8/8/8/2N5/3p4/8/3Q3K w - - 0 1';
const TWO_MOTIF_LINES: EngineLine[] = [
  { moveUci: 'c4d6', moveSan: 'Nd6+', cp: 500, mateIn: null },
  { moveUci: 'd1d3', moveSan: 'Qxd3', cp: 300, mateIn: null }
];

describe('findDefusedThreats', () => {
  test('ply-1 parity: a motif present before and gone after (target moved away) is reported', () => {
    const result = findDefusedThreats(FORK_FEN, ROOK_MOVED_AWAY_FEN, 'white', [FORK_LINE], [FORK_LINE]);
    expect(result).toContain('fork');
  });

  test('ply-1 parity: nothing to report when no candidate line has a motif to begin with', () => {
    const result = findDefusedThreats(FORK_FEN, FORK_FEN, 'white', [QUIET_LINE], [QUIET_LINE]);
    expect(result).toEqual([]);
  });

  test('a genuinely deeper (ply 3) fork is detected as defused — impossible before Phase 46', () => {
    const result = findDefusedThreats(FORK_SETUP_FEN, FORK_IN_3_DEFUSED_FEN, 'white', [FORK_IN_3_LINE], [FORK_IN_3_LINE]);
    expect(result).toContain('fork');
  });

  test('a move defusing two distinct motif types returns both', () => {
    const result = findDefusedThreats(TWO_MOTIF_FEN, TWO_MOTIF_DEFUSED_FEN, 'white', TWO_MOTIF_LINES, TWO_MOTIF_LINES);
    expect(result).toEqual(expect.arrayContaining(['fork', 'freePiece']));
  });

  test('a threat still reachable after the move is not reported as defused', () => {
    // Same position on both sides: every threat survives, so nothing is
    // defused however many motifs the scan finds.
    const result = findDefusedThreats(TWO_MOTIF_FEN, TWO_MOTIF_FEN, 'white', TWO_MOTIF_LINES, TWO_MOTIF_LINES);
    expect(result).toEqual([]);
  });

  test('handles empty candidate lines on both sides without throwing', () => {
    expect(findDefusedThreats(FORK_FEN, ROOK_MOVED_AWAY_FEN, 'white', [], [])).toEqual([]);
  });
});

describe('scanThreatOutcome', () => {
  test('preventable is the before-set regardless of whether the after-set still has it', () => {
    const stillThere = scanThreatOutcome(FORK_FEN, FORK_FEN, 'white', [FORK_LINE], [FORK_LINE]);
    expect(stillThere.preventable).toContain('fork');
    expect(stillThere.defused).toEqual([]);

    const gone = scanThreatOutcome(FORK_FEN, ROOK_MOVED_AWAY_FEN, 'white', [FORK_LINE], [FORK_LINE]);
    expect(gone.preventable).toContain('fork');
    expect(gone.defused).toContain('fork');
  });

  test('names the concrete threat that was defused, not just its type', () => {
    // docs/tactics-rework.md §5 layer 3: "you defused it" has to mean the
    // piece it was going to win is no longer winnable.
    const gone = scanThreatOutcome(FORK_FEN, ROOK_MOVED_AWAY_FEN, 'white', [FORK_LINE], [FORK_LINE]);
    const fork = gone.defusedSightings.find((sighting) => sighting.motif === 'fork');

    expect(fork?.claim).toMatchObject({ type: 'fork', actor: 'd6', victim: 'b7', prize: 'rook' });
  });

  test('a same-type threat elsewhere on the board does not mask a defused one', () => {
    // The old comparison diffed type names, so a fork appearing anywhere in
    // the after-position made a genuinely defused fork read as still live.
    const outcome = scanThreatOutcome(FORK_FEN, FORK_FEN, 'white', [FORK_LINE], [FORK_LINE]);

    expect(outcome.defusedSightings).toEqual([]);
  });
});

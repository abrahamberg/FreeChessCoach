import { describe, expect, test } from 'vitest';
import {
  TACTIC_MOTIF_FAMILIES,
  TACTIC_MOTIF_FAMILY,
  TACTIC_MOTIF_LABELS,
  TACTIC_MOTIF_TYPES,
  tacticMotifsInFamily
} from './tactic-motif.js';

/** The thirteen motifs that existed before `docs/tactics-rework.md` §6's
 * vocabulary expansion, in their original order. Stored reports key their
 * `tacticMotifs` object by these names, and the stats dashboard renders
 * `TACTIC_MOTIF_TYPES` in order, so both the names and their position are
 * part of the contract — not just the set. */
const ORIGINAL_MOTIFS = [
  'checkmate',
  'brilliantSacrifice',
  'doubleCheck',
  'fork',
  'skewer',
  'pin',
  'discoveredAttack',
  'overloadedDefender',
  'removesDefender',
  'weakBackRank',
  'trappedPiece',
  'freePiece',
  'other'
];

describe('tactic motif catalogue', () => {
  test('keeps the original thirteen motifs first, in their original order', () => {
    expect(TACTIC_MOTIF_TYPES.slice(0, ORIGINAL_MOTIFS.length)).toEqual(ORIGINAL_MOTIFS);
  });

  test('has no duplicate motif names', () => {
    expect(new Set(TACTIC_MOTIF_TYPES).size).toBe(TACTIC_MOTIF_TYPES.length);
  });

  test('labels and families cover every motif', () => {
    for (const type of TACTIC_MOTIF_TYPES) {
      expect(TACTIC_MOTIF_LABELS[type], `${type} has no label`).toBeTruthy();
      expect(TACTIC_MOTIF_FAMILIES, `${type} has no family`).toContain(TACTIC_MOTIF_FAMILY[type]);
    }
  });

  test('every label is distinct, so a dashboard row names exactly one motif', () => {
    const labels = TACTIC_MOTIF_TYPES.map((type) => TACTIC_MOTIF_LABELS[type]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('the families partition the catalogue', () => {
    const grouped = TACTIC_MOTIF_FAMILIES.flatMap((family) => tacticMotifsInFamily(family));
    expect([...grouped].sort()).toEqual([...TACTIC_MOTIF_TYPES].sort());
  });

  test('carries the defensive and positional families the old catalogue had no word for', () => {
    // docs/tactics-rework.md §6: the offence-only vocabulary is the reason a
    // move that broke a pin or gained a tempo printed "Nothing to flag".
    expect(tacticMotifsInFamily('defensive')).toContain('breaksPin');
    expect(tacticMotifsInFamily('positional')).toContain('gainsTempo');
    expect(tacticMotifsInFamily('offensive')).toContain('discoveredCheck');
  });
});

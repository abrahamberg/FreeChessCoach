import { describe, expect, test, vi } from 'vitest';
import type { AvailableMotifScan } from '../available-motifs-scan.js';
import type { VerifiedTacticClaim } from '../verify-tactic-claims.js';
import { countingVerdictDeps, decideMoveVerdict, walkLineValue, type PreventionScans, type VerdictReason } from './index.js';
import { netPawns } from './line-value.js';
import { materialAgrees } from './reasons/confirmed.js';
import {
  BACK_RANK_FEN,
  GREEK_GIFT_FEN,
  QUEEN_FOR_KNIGHT_FEN,
  ROOK_FORK_FEN,
  START_FEN,
  scenario
} from './verdict-test-fixtures.js';

/** Black's Re1# threat, as the prevention scan reports it before h3. */
const BACK_RANK_MATE: VerifiedTacticClaim = {
  type: 'weakBackRank',
  actor: 'e8',
  targets: ['e1'],
  victim: null,
  gainKind: 'mate',
  expectedGain: 0,
  prize: null,
  evidence: { arrows: [{ from: 'e8', to: 'e1' }], highlights: ['g1'] },
  detail: 'the back rank has no escape square',
  confidence: 0.9,
  verifiedGain: 0,
  horizon: 'immediate',
  verifiedBy: 'static'
};

const THREAT_BEFORE: AvailableMotifScan = {
  motifs: new Set(['weakBackRank']),
  sightings: [
    { rank: 0, ply: 1, moveSan: 'Re1#', motif: 'weakBackRank', fenBefore: BACK_RANK_FEN.replace(' w ', ' b '), claim: BACK_RANK_MATE }
  ]
};
const NOTHING: AvailableMotifScan = { motifs: new Set(), sightings: [] };

function decide(input: Parameters<typeof decideMoveVerdict>[0]) {
  const checked: VerdictReason[] = [];
  const { deps } = countingVerdictDeps();
  return { verdict: decideMoveVerdict(input, { ...deps, onCheck: (reason) => checked.push(reason) }), checked };
}

describe('decideMoveVerdict — credits', () => {
  test('found a fork: foundTactic, worth the rook it wins', () => {
    const input = scenario({
      fen: ROOK_FORK_FEN,
      moveSan: 'Nd6+',
      quality: 'best',
      before: [[['Nd6+', 'Kd7', 'Nxb7'], 500], [['Ka2'], -200]],
      after: [[['Kd7', 'Nxb7', 'Kc6'], 500]]
    });
    const { verdict } = decide(input);

    expect(verdict).toMatchObject({
      kind: 'credit',
      reason: 'foundTactic',
      explainedCpWhite: 500,
      gainedPawns: 5,
      card: { tacticOpportunity: { type: 'fork', found: true }, detail: null }
    });
  });

  test('defused a mate threat: defusedThreat, with the scan run only for that ply', () => {
    const backRank = vi.fn((): PreventionScans => ({ before: THREAT_BEFORE, after: NOTHING }));
    const quiet = vi.fn((): PreventionScans => ({ before: NOTHING, after: NOTHING }));
    const blunder = vi.fn((): PreventionScans => ({ before: NOTHING, after: NOTHING }));

    const defended = scenario({
      fen: BACK_RANK_FEN,
      moveSan: 'h3',
      quality: 'best',
      before: [[['h3', 'Re2', 'Qd8+'], 300], [['Qd5', 'Re1#'], { mate: -1 }]],
      after: [[['Kf8'], 300]]
    });
    const { verdict, checked } = decide({ ...defended, preventionScans: backRank });
    decide({ ...equalLines(), preventionScans: quiet });
    decide({ ...queenForKnight(), preventionScans: blunder });

    expect(verdict).toMatchObject({
      kind: 'credit',
      reason: 'defusedThreat',
      card: { tacticPrevention: { type: 'weakBackRank', prevented: true, gain: { kind: 'mate' } } }
    });
    // h3's line wins nothing, so a find could only be positional (tier 2):
    // the threat (tier 1) is checked first, and that settles it.
    expect(checked).toEqual(['defusedThreat']);
    expect(backRank).toHaveBeenCalledTimes(1);
    expect(quiet).not.toHaveBeenCalled();
    expect(blunder).not.toHaveBeenCalled();
  });

  test('a sound sacrifice (net −2, eval holds): no failure, and no find either', () => {
    const input = scenario({
      fen: GREEK_GIFT_FEN,
      ply: 17,
      moveSan: 'Bxh7+',
      quality: 'best',
      before: [[['Bxh7+', 'Kxh7', 'Ng5+', 'Kg8', 'Qh5', 'Bxg5', 'Bxg5', 'Qb6'], 150], [['a3'], -20]],
      after: [[['Kxh7', 'Ng5+', 'Kg8', 'Qh5', 'Bxg5', 'Bxg5', 'Qb6'], 150]]
    });
    const { verdict } = decide(input);

    expect(verdict?.kind).not.toBe('failure');
    expect(verdict?.reason).not.toBe('foundTactic');
    // Even a detector that named it couldn't make it a find: the played
    // line nets a bishop for a pawn.
    const played = walkLineValue(GREEK_GIFT_FEN, ['Bxh7+', 'Kxh7', 'Ng5+', 'Kg8', 'Qh5', 'Bxg5', 'Bxg5', 'Qb6'], 'white');
    expect(netPawns(played)).toBe(-2);
    expect(materialAgrees(played, 'gain', 'material')).toBe(false);
  });

  test('every top line equal: null', () => {
    expect(decide(equalLines()).verdict).toBeNull();
  });
});

function equalLines() {
  return scenario({
    fen: START_FEN,
    moveSan: 'e4',
    quality: 'best',
    before: [[['e4', 'e5'], 30], [['d4', 'd5'], 30], [['Nf3', 'Nf6'], 30], [['c4', 'e5'], 30]],
    after: [[['e5', 'Nf3'], 30]]
  });
}

function queenForKnight() {
  return scenario({
    fen: QUEEN_FOR_KNIGHT_FEN,
    moveSan: 'Nxc6',
    quality: 'blunder',
    before: [[['Qf3'], 400], [['Qe2'], 380]],
    after: [[['Rxd1', 'Ne7+', 'Kf8'], -200]],
    withNext: true
  });
}

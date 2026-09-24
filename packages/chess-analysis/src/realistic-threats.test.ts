import { describe, expect, test } from 'vitest';
import type { EngineLine } from '@freechesscoach/shared';
import { scanAvailableMotifs, type AvailableMotifScan, type PvMotifSighting } from './available-motifs-scan.js';
import { scanDepthForRank } from './prevention-scan-schedule.js';
import { annotatePvTactics } from './pv-tactics.js';
import { realisticThreatScan, scanRealisticThreats } from './realistic-threats.js';

// Nd6+ forks the king on e8 and the rook on b7 (and gains a tempo doing it).
const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
// The same pieces with Black to move — only the side to move differs, which
// is what decides whose perspective the line evals are read from.
const QUIET_BLACK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 b - - 0 1';

function line(moveSan: string, moveUci: string, cp: number | null, mateIn: number | null = null): EngineLine {
  return { moveUci, moveSan, cp, mateIn, pvSan: [moveSan] };
}

const FORK_LINE = line('Nd6+', 'c4d6', 500);

function motifsOf(scan: ReturnType<typeof realisticThreatScan>): string[] {
  return scan.sightings.map((sighting) => `${sighting.rank}:${sighting.motif}`);
}

describe('realisticThreatScan', () => {
  test('keeps a sighting on the best line that wins material, and drops the one that wins nothing', () => {
    const lines = [FORK_LINE, line('Ka2', 'a1a2', 0)];
    const scan = realisticThreatScan(scanAvailableMotifs(FORK_FEN, lines), lines, FORK_FEN);

    // gainsTempo is a claim, but a tempo is not a threat to answer.
    expect(motifsOf(scan)).toEqual(['0:fork']);
    expect([...scan.motifs]).toEqual(['fork']);
  });

  test('drops a sighting that only appears in a losing rank-4 line the side to move would never play', () => {
    const lines = [line('Ka2', 'a1a2', 300), line('Nb2', 'c4b2', 290), line('Na3', 'c4a3', 280), line('Nd6+', 'c4d6', -200)];
    const raw = scanAvailableMotifs(FORK_FEN, lines);
    expect(raw.motifs.has('fork')).toBe(true);

    const scan = realisticThreatScan(raw, lines, FORK_FEN);
    expect(scan.sightings).toEqual([]);
    expect(scan.motifs.size).toBe(0);
  });

  test('keeps a lower-ranked sighting whose line is about as good as the best', () => {
    const lines = [line('Ka2', 'a1a2', 520), line('Nd6+', 'c4d6', 500)];
    const scan = realisticThreatScan(scanAvailableMotifs(FORK_FEN, lines), lines, FORK_FEN);

    expect(motifsOf(scan)).toEqual(['1:fork']);
  });

  test('reads the line evals from the side to move, taken from the FEN', () => {
    // Same White-perspective numbers, but Black to move: -300 is Black's best
    // and +200 is a line Black would never play.
    const lines = [line('Ka2', 'a1a2', -300), line('Nd6+', 'c4d6', 200)];
    const fake = scanAvailableMotifs(FORK_FEN, lines);

    expect(realisticThreatScan(fake, lines, QUIET_BLACK_FEN).sightings).toEqual([]);
    expect(motifsOf(realisticThreatScan(fake, lines, FORK_FEN))).toEqual(['1:fork']);
  });

  test('keeps a mate sighting on a mating line', () => {
    const mateFen = '7k/6pp/8/8/8/8/5PPP/4R1K1 w - - 0 1';
    const lines = [line('Re8#', 'e1e8', null, 1)];
    const scan = realisticThreatScan(scanAvailableMotifs(mateFen, lines), lines, mateFen);

    expect(scan.sightings.length).toBeGreaterThan(0);
    expect(scan.sightings.every((sighting) => sighting.claim.gainKind === 'mate')).toBe(true);
  });
});

/** The pre-77.4 scan: every rank walked in `annotatePvTactics`' full mode
 * (features, diffs, every ply classified), odd-ply claims kept. */
function fullModeScan(fen: string, lines: readonly EngineLine[]): AvailableMotifScan {
  const sightings: PvMotifSighting[] = [];
  lines.slice(0, 5).forEach((engineLine, rank) => {
    const pv = engineLine.pvSan && engineLine.pvSan.length > 0 ? engineLine.pvSan : [engineLine.moveSan];
    for (const step of annotatePvTactics(fen, pv, scanDepthForRank(rank)).steps) {
      if (step.ply % 2 === 0) continue;
      for (const claim of step.claims) {
        sightings.push({ rank, ply: step.ply, moveSan: step.moveSan, motif: claim.type, fenBefore: step.fenBefore, claim });
      }
    }
  });
  return { motifs: new Set(sightings.map((sighting) => sighting.motif)), sightings };
}

describe('scanRealisticThreats', () => {
  const TWO_KNIGHTS_FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
  const pvLine = (pvSan: string[], moveUci: string, cp: number): EngineLine => ({
    moveUci,
    moveSan: pvSan[0] ?? '',
    cp,
    mateIn: null,
    pvSan
  });
  const CASES: [string, string, EngineLine[]][] = [
    ['fork on the best line', FORK_FEN, [FORK_LINE, line('Ka2', 'a1a2', 0)]],
    [
      'fork only on an unplayable rank',
      FORK_FEN,
      [line('Ka2', 'a1a2', 300), line('Nb2', 'c4b2', 290), line('Na3', 'c4a3', 280), line('Nd6+', 'c4d6', -200)]
    ],
    ['black to move reads the evals from Black', QUIET_BLACK_FEN, [line('Ka2', 'a1a2', -300), FORK_LINE]],
    [
      'multi-ply lines, the last one unplayable',
      TWO_KNIGHTS_FEN,
      [
        pvLine(['Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7', 'Kxf7', 'Qf3+'], 'f3g5', 60),
        pvLine(['d3', 'Bc5', 'O-O', 'd6', 'c3'], 'd2d3', 40),
        pvLine(['Nc3', 'Nxe4', 'Nxe4', 'd5', 'Bd3'], 'b1c3', 30),
        pvLine(['Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7', 'Kxf7'], 'f3g5', -250)
      ]
    ]
  ];

  test.each(CASES)('equals filter-after-scan on the full path: %s', (_name, fen, lines) => {
    const expected = realisticThreatScan(fullModeScan(fen, lines), lines, fen);
    const fast = scanRealisticThreats(fen, lines);

    expect(fast.sightings).toEqual(expected.sightings);
    expect([...fast.motifs]).toEqual([...expected.motifs]);
    expect(fast).toEqual(realisticThreatScan(scanAvailableMotifs(fen, lines), lines, fen));
  });

  test('never walks a rank whose line the side to move would not play', () => {
    const lines = [line('Ka2', 'a1a2', 300), line('Nd6+', 'c4d6', -200)];
    const walked: number[] = [];
    scanAvailableMotifs(FORK_FEN, lines, 5, (rank) => {
      walked.push(rank);
      return rank === 0;
    });

    expect(walked).toEqual([0, 1]);
    expect(fullModeScan(FORK_FEN, lines).sightings.some((sighting) => sighting.rank === 1)).toBe(true);
    expect(scanRealisticThreats(FORK_FEN, lines).sightings).toEqual([]);
  });
});

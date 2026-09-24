import { describe, expect, test } from 'vitest';
import type { DiagnosticProfileEntry } from '@freechesscoach/chess-analysis';
import { renderDiagnosticProfileBlock, type DiagnosticReportItem } from './diagnostic-report.js';

function entry(overrides: Partial<DiagnosticProfileEntry> = {}): DiagnosticProfileEntry {
  return {
    code: 'TA-07',
    direction: 'D',
    opportunities: 9,
    episodes: 6,
    failureRate: 6 / 9,
    posteriorMean: 0.6,
    credibleInterval: [0.4, 0.8],
    confidence: 'probable',
    spread: { games: 5, sessions: 3, openings: 3, sides: 2 },
    totalHwdl: 1.8,
    severityMix: { minor: 0, meaningful: 2, major: 4, decisive: 0 },
    meanReachability: 0.7,
    scopeTags: ['general'],
    controlSkill: { code: 'TA-07', direction: 'O', failureRate: 0.1 },
    historyStatus: 'persistent',
    ...overrides
  };
}

function item(overrides: Partial<DiagnosticProfileEntry> = {}, firedGates: DiagnosticReportItem['firedGates'] = []): DiagnosticReportItem {
  return { entry: entry(overrides), firedGates };
}

describe('renderDiagnosticProfileBlock', () => {
  test('renders the fallback when there are no items', () => {
    expect(renderDiagnosticProfileBlock([])).toMatch(/no confident diagnoses/);
  });

  test('renders E/O, confidence, severity, scope, and control for one item', () => {
    const block = renderDiagnosticProfileBlock([item()]);
    expect(block).toContain('1. TA-07.D');
    expect(block).toContain('E/O: 6/9 (67%)');
    expect(block).toContain('Confidence: probable');
    expect(block).toContain('2 meaningful, 4 major');
    expect(block).toContain('Scope: general');
    expect(block).toContain('Control: TA-07.O intact (10% failure rate)');
  });

  test('numbers multiple items in order and separates them with a blank line', () => {
    const block = renderDiagnosticProfileBlock([item({ code: 'TA-07' }), item({ code: 'BV-01' })]);
    expect(block).toContain('1. TA-07.D');
    expect(block).toContain('2. BV-01.D');
    expect(block.split('\n\n').filter((part) => /^\d+\. /.test(part))).toHaveLength(2);
  });

  test('shows "no intact control skill on record" when controlSkill is null', () => {
    const block = renderDiagnosticProfileBlock([item({ controlSkill: null })]);
    expect(block).toContain('Control: no intact control skill on record');
  });

  test('appends a failed-gates line only when gates fired', () => {
    const clean = renderDiagnosticProfileBlock([item()]);
    expect(clean).not.toContain('Failed gates');

    const gated = renderDiagnosticProfileBlock([item({}, [{ code: 'DQ-05', evidence: 'mean reachability 0.20 below the 0.35 threshold' }])]);
    expect(gated).toContain('Failed gates: DQ-05 (mean reachability 0.20 below the 0.35 threshold)');
  });

  test('falls back to the raw code when the catalog has no label (defensive — every real code has one)', () => {
    const block = renderDiagnosticProfileBlock([item({ code: 'ZZ-99' })]);
    expect(block).toContain('1. ZZ-99.D — ZZ-99');
  });

  describe('sample context', () => {
    const sample = { ratedGames: 16, timeControl: '600+0', requiredGames: 15, fullEvidenceGames: 30 };

    test('a small window is called an early read and the confidence tiers are explained', () => {
      const block = renderDiagnosticProfileBlock([item()], sample);
      expect(block).toContain('Evidence base: 16 rated games at time control 600+0. This is an early read');
      expect(block).toContain('"signal" = it has repeated in more than one game');
    });

    test('a full window is stated without the early-read caveat', () => {
      const block = renderDiagnosticProfileBlock([item()], { ...sample, ratedGames: 40 });
      expect(block).toContain('Evidence base: 40 rated games at time control 600+0.');
      expect(block).not.toContain('early read');
    });

    test('under the minimum, an empty profile says how far away it is and tells the coach to hold patterns as hypotheses', () => {
      const block = renderDiagnosticProfileBlock([], { ...sample, ratedGames: 6 });
      expect(block).toContain('only 6 of 15 rated games at time control 600+0');
      expect(block).toContain('hypothesis');
    });

    test('at the minimum an empty profile keeps the generic no-confident-diagnosis wording', () => {
      expect(renderDiagnosticProfileBlock([], sample)).toMatch(/no confident diagnoses/);
    });
  });
});

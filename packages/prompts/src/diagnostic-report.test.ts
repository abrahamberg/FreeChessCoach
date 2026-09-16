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
    expect(block.split('\n\n')).toHaveLength(2);
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
});

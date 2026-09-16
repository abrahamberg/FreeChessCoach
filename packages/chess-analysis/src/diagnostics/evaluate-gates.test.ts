import { describe, expect, test } from 'vitest';
import { evaluateGates, type GateEvaluationInput, type GateWindowGame } from './evaluate-gates.js';

function healthyGame(index: number, overrides: Partial<GateWindowGame> = {}): GateWindowGame {
  return {
    gameId: `g${index}`,
    timeControl: '600',
    rated: true,
    variant: null,
    termination: 'won by checkmate',
    userColor: index % 2 === 0 ? 'white' : 'black',
    opening: `opening-${index}`,
    opponentName: `opponent-${index}`,
    ratingAtGame: 1200,
    ratingProvisional: false,
    hasReliableClockData: true,
    ...overrides
  };
}

function healthyWindow(count = 30): GateWindowGame[] {
  return Array.from({ length: count }, (_, i) => healthyGame(i));
}

function baseInput(overrides: Partial<GateEvaluationInput> = {}): GateEvaluationInput {
  return {
    games: healthyWindow(),
    opportunities: 10,
    meanReachability: 0.6,
    cascadeCollapsedCount: 0,
    decidedPositionIncidentCount: 0,
    totalIncidentCount: 0,
    selectionBias: null,
    ...overrides
  };
}

describe('evaluateGates', () => {
  test('a clean, sufficient window fires no gates', () => {
    expect(evaluateGates(baseInput())).toEqual([]);
  });

  test('DQ-01: fewer than the minimum rated games', () => {
    const fired = evaluateGates(baseInput({ games: healthyWindow(5) }));
    expect(fired.some((gate) => gate.code === 'DQ-01')).toBe(true);
    expect(fired.find((gate) => gate.code === 'DQ-01')!.evidence).toMatch(/5 rated games/);
  });

  test('DQ-02: too few opportunities', () => {
    const fired = evaluateGates(baseInput({ opportunities: 3 }));
    expect(fired.some((gate) => gate.code === 'DQ-02')).toBe(true);
  });

  test('DQ-03/DQ-15: mixed exact time-control strings fire both together', () => {
    const games = healthyWindow(30).map((game, i) => (i < 15 ? { ...game, timeControl: '600' } : { ...game, timeControl: '600+5' }));
    const fired = evaluateGates(baseInput({ games }));

    expect(fired.some((gate) => gate.code === 'DQ-03')).toBe(true);
    expect(fired.some((gate) => gate.code === 'DQ-15')).toBe(true);
  });

  test('DQ-04: too many games missing reliable clock data', () => {
    const games = healthyWindow(30).map((game, i) => (i < 10 ? { ...game, hasReliableClockData: false } : game));
    const fired = evaluateGates(baseInput({ games }));

    expect(fired.some((gate) => gate.code === 'DQ-04')).toBe(true);
  });

  test('DQ-05: mean reachability below the DQ-05 threshold', () => {
    const fired = evaluateGates(baseInput({ meanReachability: 0.1 }));
    expect(fired.some((gate) => gate.code === 'DQ-05')).toBe(true);
  });

  test('DQ-05 does not fire when there are zero opportunities to be unreachable', () => {
    const fired = evaluateGates(baseInput({ meanReachability: 0.1, opportunities: 0 }));
    expect(fired.some((gate) => gate.code === 'DQ-05')).toBe(false);
  });

  test('DQ-06: sample dominated by one opening', () => {
    const games = healthyWindow(10).map((game, i) => (i < 7 ? { ...game, opening: 'B01' } : game));
    const fired = evaluateGates(baseInput({ games }));

    const gate = fired.find((g) => g.code === 'DQ-06');
    expect(gate).toBeDefined();
    expect(gate!.evidence).toMatch(/opening/);
  });

  test('DQ-06: sample dominated by one opponent', () => {
    const games = healthyWindow(10).map((game, i) => (i < 8 ? { ...game, opponentName: 'nemesis' } : game));
    const fired = evaluateGates(baseInput({ games }));

    const gate = fired.find((g) => g.code === 'DQ-06');
    expect(gate).toBeDefined();
    expect(gate!.evidence).toMatch(/opponent/);
  });

  test('DQ-08: any provisional rating in the window', () => {
    const games = healthyWindow(30).map((game, i) => (i === 0 ? { ...game, ratingProvisional: true } : game));
    const fired = evaluateGates(baseInput({ games }));

    expect(fired.some((gate) => gate.code === 'DQ-08')).toBe(true);
  });

  test('DQ-08: a large rating swing across the window', () => {
    const games = healthyWindow(30).map((game, i) => ({ ...game, ratingAtGame: i === 0 ? 900 : 1300 }));
    const fired = evaluateGates(baseInput({ games }));

    expect(fired.some((gate) => gate.code === 'DQ-08')).toBe(true);
  });

  test('DQ-09: every recorded incident occurred in a completely decided position', () => {
    const fired = evaluateGates(baseInput({ totalIncidentCount: 3, decidedPositionIncidentCount: 3 }));
    expect(fired.some((gate) => gate.code === 'DQ-09')).toBe(true);
  });

  test('DQ-09 does not fire when only some incidents were in decided positions', () => {
    const fired = evaluateGates(baseInput({ totalIncidentCount: 3, decidedPositionIncidentCount: 1 }));
    expect(fired.some((gate) => gate.code === 'DQ-09')).toBe(false);
  });

  test('DQ-11: cascade collapsing merged several recorded errors', () => {
    const fired = evaluateGates(baseInput({ cascadeCollapsedCount: 4 }));
    const gate = fired.find((g) => g.code === 'DQ-11');
    expect(gate).toBeDefined();
    expect(gate!.evidence).toMatch(/4/);
  });

  test('DQ-12: a variant or unrated game contaminates the sample', () => {
    const games = healthyWindow(30).map((game, i) => (i === 0 ? { ...game, variant: 'chess960' } : game));
    const fired = evaluateGates(baseInput({ games }));

    expect(fired.some((gate) => gate.code === 'DQ-12')).toBe(true);
  });

  test('DQ-13: a disconnect/abandon termination', () => {
    const games = healthyWindow(30).map((game, i) => (i === 0 ? { ...game, termination: 'Game abandoned' } : game));
    const fired = evaluateGates(baseInput({ games }));

    const gate = fired.find((g) => g.code === 'DQ-13');
    expect(gate).toBeDefined();
    expect(gate!.evidence).toMatch(/g0/);
  });

  test('DQ-16: the sample was pre-filtered to one result type', () => {
    const fired = evaluateGates(baseInput({ selectionBias: 'losses-only' }));
    const gate = fired.find((g) => g.code === 'DQ-16');
    expect(gate).toBeDefined();
    expect(gate!.evidence).toMatch(/losses-only/);
  });

  test('every fired gate carries non-empty evidence, never a bare boolean', () => {
    const fired = evaluateGates(baseInput({ games: healthyWindow(2), opportunities: 1, selectionBias: 'wins-only' }));
    expect(fired.length).toBeGreaterThan(0);
    for (const gate of fired) {
      expect(gate.evidence.length).toBeGreaterThan(0);
    }
  });
});

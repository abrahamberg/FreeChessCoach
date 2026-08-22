import type { EngineEval } from '@chess-coach/shared';
import { describe, expect, test } from 'vitest';
import { classifyMiss, type MissClassificationInput } from './classify-miss.js';

function evalAt(lines: EngineEval['lines']): EngineEval {
  return { ply: 1, fen: 'start', depth: 16, lines };
}

function candidate(overrides: Partial<MissClassificationInput> = {}): MissClassificationInput {
  return {
    severity: 'mistake',
    mover: 'white',
    evalBefore: evalAt([
      { moveUci: 'e2e4', moveSan: 'e4', cp: 500, mateIn: null },
      { moveUci: 'e2e3', moveSan: 'e3', cp: 100, mateIn: null }
    ]),
    evalAfter: evalAt([{ moveUci: 'e2e4', moveSan: 'e4', cp: 100, mateIn: null }]),
    ...overrides
  };
}

describe('classifyMiss', () => {
  test('re-labels a move that fails to punish a winning opportunity', () => {
    expect(classifyMiss(candidate())).toEqual({ classification: 'miss', underlyingSeverity: 'mistake' });
  });

  test('does not re-label a sound severity', () => {
    expect(classifyMiss(candidate({ severity: 'good' }))).toEqual({ classification: 'good' });
  });

  test('recognizes a missed mate opportunity', () => {
    expect(
      classifyMiss(
        candidate({
          evalBefore: evalAt([{ moveUci: 'e2e4', moveSan: 'e4', cp: null, mateIn: 1 }]),
          evalAfter: evalAt([{ moveUci: 'e2e4', moveSan: 'e4', cp: 0, mateIn: null }])
        })
      )
    ).toEqual({ classification: 'miss', underlyingSeverity: 'mistake' });
  });
});

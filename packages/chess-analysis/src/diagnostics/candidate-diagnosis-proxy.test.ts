import { describe, expect, test } from 'vitest';
import { annotateCandidateMoves } from '../candidate-moves.js';
import { candidateDiagnosisCodes } from './candidate-diagnosis-proxy.js';

describe('candidateDiagnosisCodes', () => {
  test('a self-blunder yields BV-01 and MS-03', () => {
    const fenBefore = '3rk3/8/8/8/8/8/8/3Q3K w - - 0 1';
    const [annotation] = annotateCandidateMoves(fenBefore, ['Qd5']);
    expect(annotation).toBeDefined();

    const codes = candidateDiagnosisCodes(annotation!);

    expect(codes).toContain('BV-01');
    expect(codes).toContain('MS-03');
    expect(codes).not.toContain('BV-02');
  });

  test('ignoring an already-hanging own piece yields BV-01 and MS-02', () => {
    const fenBefore = '3rk3/8/8/3Q4/8/8/8/7K w - - 0 1';
    const [annotation] = annotateCandidateMoves(fenBefore, ['Kh2']);
    expect(annotation).toBeDefined();

    const codes = candidateDiagnosisCodes(annotation!);

    expect(codes).toContain('BV-01');
    expect(codes).toContain('MS-02');
  });

  test('ignoring an already-hanging opponent piece yields BV-02 only', () => {
    const fenBefore = '4k3/8/8/8/Q2n4/8/8/4K3 w - - 0 1';
    const [annotation] = annotateCandidateMoves(fenBefore, ['Kf1']);
    expect(annotation).toBeDefined();

    const codes = candidateDiagnosisCodes(annotation!);

    expect(codes).toEqual(['BV-02']);
  });

  test('a clean, safe quiet move yields no codes', () => {
    const fenBefore = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
    const [annotation] = annotateCandidateMoves(fenBefore, ['Kd2']);
    expect(annotation).toBeDefined();

    expect(candidateDiagnosisCodes(annotation!)).toEqual([]);
  });
});

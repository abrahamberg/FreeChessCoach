import { describe, expect, it } from 'vitest';
import { evalGap, playedMoveGap } from './eval-witness.js';

const MATE_IN_3 = 1970;
const MATE_IN_5 = 1950;

describe('evalGap', () => {
  it('counts a piece lost from an equal position', () => {
    expect(evalGap(300, 0, 'white').meaningful).toBe(true);
  });

  it('does not count a sign flip that leaves the game balanced', () => {
    const gap = evalGap(40, -40, 'white');
    expect(gap.outcomeChanged).toBe(false);
    expect(gap.meaningful).toBe(false);
  });

  it('counts a queen dropped while still winning, where win% has saturated', () => {
    const gap = evalGap(1500, 600, 'white');
    expect(gap.winPctGap).toBeLessThan(10);
    expect(gap.sameDecisiveBand).toBe(true);
    expect(gap.meaningful).toBe(true);
  });

  it('does not count a small slip inside a won position', () => {
    expect(evalGap(1500, 1300, 'white').meaningful).toBe(false);
  });

  it('counts a missed mate that still leaves the mover winning', () => {
    expect(evalGap(MATE_IN_3, 1200, 'white').meaningful).toBe(true);
  });

  it('does not count a slower mate', () => {
    expect(evalGap(MATE_IN_3, MATE_IN_5, 'white').meaningful).toBe(false);
  });

  it('counts leaving the winning band for a balanced game', () => {
    const gap = evalGap(300, 200, 'white');
    expect(gap.winPctGap).toBeLessThan(10);
    expect(gap.outcomeChanged).toBe(true);
    expect(gap.meaningful).toBe(true);
  });

  it('never counts a move the engine rates above its own best line', () => {
    const gap = evalGap(20, 60, 'white');
    expect(gap.winPctGap).toBeLessThan(0);
    expect(gap.meaningful).toBe(false);
  });

  it('reads both scores from Black when Black moved', () => {
    expect(evalGap(-300, 0, 'black').meaningful).toBe(true);
    expect(evalGap(0, -300, 'black').meaningful).toBe(false);
    expect(evalGap(-1500, -600, 'black').meaningful).toBe(true);
  });
});

describe('playedMoveGap', () => {
  it('compares the best line against the played move', () => {
    expect(playedMoveGap({ cpBefore: 250, cpAfter: -60, mover: 'white' })?.meaningful).toBe(true);
  });

  it('is null for a move stored without evals', () => {
    expect(playedMoveGap({ cpBefore: undefined, cpAfter: 10, mover: 'white' })).toBeNull();
    expect(playedMoveGap({ cpBefore: 10, cpAfter: undefined, mover: 'white' })).toBeNull();
  });
});

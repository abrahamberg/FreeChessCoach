import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { pins } from './tactic-pins.js';

describe('pins', () => {
  test('detects an absolute pin to the enemy king', () => {
    const chess = new Chess('4k3/8/2n5/1B6/8/8/4K3/8 w - - 0 1');

    expect(pins(chess)).toEqual([{ by: 'b5', pinned: 'c6', against: 'e8', kind: 'absolute' }]);
  });

  test('detects a relative pin to a higher-value piece', () => {
    const chess = new Chess('3q3k/8/8/3r4/8/8/8/K2R4 w - - 0 1');

    expect(pins(chess)).toEqual([{ by: 'd1', pinned: 'd5', against: 'd8', kind: 'relative' }]);
  });

  test('reports no pin when an own piece blocks the ray first', () => {
    const chess = new Chess('3k4/8/8/8/8/3P4/8/K2R4 w - - 0 1');

    expect(pins(chess)).toEqual([]);
  });

  test('reports no pin when nothing sits behind the first enemy piece', () => {
    const chess = new Chess('7k/8/8/3r4/8/8/8/K2R4 w - - 0 1');

    expect(pins(chess)).toEqual([]);
  });
});

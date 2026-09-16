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

  test('reports no pin when another black piece sits between the pinned piece and the king behind it', () => {
    // Same diagonal as the absolute-pin fixture above, but a black pawn on
    // d7 now stands between the pinned knight and the king — the knight can
    // step off the diagonal without exposing anything, because its own pawn
    // is still in the way.
    const chess = new Chess('4k3/3p4/2n5/1B6/8/8/4K3/8 w - - 0 1');

    expect(pins(chess)).toEqual([]);
  });

  test('reports no pin when a white piece sits between the pinned piece and what would be behind it', () => {
    // A white knight stands between the pinned rook and the queen behind it
    // — the rook is free to move, the knight is still blocking the file
    // regardless of which side's piece it is.
    const chess = new Chess('3q3k/8/3N4/3r4/8/8/8/K2R4 w - - 0 1');

    expect(pins(chess)).toEqual([]);
  });
});

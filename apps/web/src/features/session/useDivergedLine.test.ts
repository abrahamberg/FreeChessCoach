import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useDivergedLine, type ProposeDivergedLineToolResult } from './useDivergedLine.js';

// After 1.e4 — Black to move.
const REAL = { ply: 1, fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' };

function hypothetical(input: Record<string, unknown>) {
  return { toolCallId: crypto.randomUUID(), toolName: 'hypothetical_line', input };
}

function call(result: { current: ReturnType<typeof useDivergedLine> }, input: Record<string, unknown>) {
  let output: ProposeDivergedLineToolResult | undefined;
  act(() => {
    output = result.current.handleToolCall(hypothetical(input), REAL) as ProposeDivergedLineToolResult;
  });
  return output!;
}

describe('useDivergedLine hypothetical_line', () => {
  test('moves alone extend an open line from its last move', () => {
    const { result } = renderHook(() => useDivergedLine());
    expect(call(result, { moves: ['e5'] })).toMatchObject({ ok: true, continuedLine: false });
    expect(call(result, { moves: ['Nf3'] })).toMatchObject({
      ok: true,
      continuedLine: true,
      moves: [{ san: 'Nf3' }],
      nextToMove: 'black'
    });
    expect(result.current.line?.moves.map((move) => move.san)).toEqual(['e5', 'Nf3']);
  });

  test('newLine: true replaces the open line with a fresh one off the real position', () => {
    const { result } = renderHook(() => useDivergedLine());
    call(result, { moves: ['e5', 'Nf3'] });
    expect(call(result, { moves: ['c5'], newLine: true })).toMatchObject({ ok: true, continuedLine: false });
    expect(result.current.line?.moves.map((move) => move.san)).toEqual(['c5']);
  });

  test('a failed extension names newLine as the way out', () => {
    const { result } = renderHook(() => useDivergedLine());
    call(result, { moves: ['e5'] });
    const output = call(result, { moves: ['c5'] });
    expect(output.ok).toBe(false);
    expect(output.error).toContain('pass newLine: true');
    expect(result.current.line?.moves.map((move) => move.san)).toEqual(['e5']);
  });
});

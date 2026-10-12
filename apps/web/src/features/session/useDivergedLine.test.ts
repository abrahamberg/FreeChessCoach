import { act, renderHook } from '@testing-library/react';
import { DEFAULT_POSITION } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { lineGameTree } from '../board/move-tree-state.js';
import { useDivergedLine, type ProposeDivergedLineToolResult } from './useDivergedLine.js';

// After 1.e4 — Black to move.
const REAL = { ply: 1, fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' };

const BASE = lineGameTree(DEFAULT_POSITION, ['e4']);

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
    const { result } = renderHook(() => useDivergedLine(BASE));
    expect(call(result, { moves: ['e5'] })).toMatchObject({ ok: true, continuedLine: false });
    expect(call(result, { moves: ['Nf3'] })).toMatchObject({
      ok: true,
      continuedLine: true,
      moves: [{ san: 'Nf3' }],
      nextToMove: 'black'
    });
    expect(result.current.line?.moves.map((move) => move.san)).toEqual(['e5', 'Nf3']);
  });

  test('newLine: true starts a second variation off the real position; the first one stays in the tree', () => {
    const { result } = renderHook(() => useDivergedLine(BASE));
    call(result, { moves: ['e5', 'Nf3'] });
    expect(call(result, { moves: ['c5'], newLine: true })).toMatchObject({ ok: true, continuedLine: false });
    expect(result.current.line?.moves.map((move) => move.san)).toEqual(['c5']);
    expect(result.current.tree.nodes.filter((node) => node.parentId === 'n1').map((node) => node.san)).toEqual(['e5', 'c5']);
  });

  test('a move played on the board extends the open variation; one played at the game starts a new one', () => {
    const { result } = renderHook(() => useDivergedLine(BASE));
    call(result, { moves: ['e5'] });
    act(() => void result.current.appendMove({ san: 'Nf3' }, REAL));
    expect(result.current.line?.moves.map((move) => move.san)).toEqual(['e5', 'Nf3']);

    act(() => result.current.exit());
    expect(result.current.line).toBeNull();
    expect(result.current.fen).toBeNull();
    act(() => void result.current.appendMove({ san: 'c5' }, REAL));
    expect(result.current.line?.moves.map((move) => move.san)).toEqual(['c5']);
    expect(result.current.tree.nodes).toHaveLength(4);
  });

  test('undoing the last move removes it, and the variation when it was the only move', () => {
    const { result } = renderHook(() => useDivergedLine(BASE));
    call(result, { moves: ['e5', 'Nf3'] });
    act(() => result.current.undoLastMove());
    expect(result.current.line?.moves.map((move) => move.san)).toEqual(['e5']);
    act(() => result.current.undoLastMove());
    expect(result.current.line).toBeNull();
    expect(result.current.tree.nodes.map((node) => node.id)).toEqual(['n1']);
  });

  test('show_position leaves the variation but keeps it in the tree', () => {
    const { result } = renderHook(() => useDivergedLine(BASE));
    call(result, { moves: ['e5'] });
    act(() => {
      result.current.handleToolCall({ toolCallId: 'x', toolName: 'show_position', input: {} }, REAL);
    });
    expect(result.current.line).toBeNull();
    expect(result.current.tree.nodes).toHaveLength(2);
  });

  test('a different game starts over', () => {
    const { result, rerender } = renderHook(({ base }) => useDivergedLine(base), { initialProps: { base: BASE } });
    call(result, { moves: ['e5'] });
    rerender({ base: lineGameTree(DEFAULT_POSITION, ['e4', 'e5']) });
    expect(result.current.line).toBeNull();
    expect(result.current.tree.nodes).toHaveLength(2);
  });

  test('a failed extension names newLine as the way out', () => {
    const { result } = renderHook(() => useDivergedLine(BASE));
    call(result, { moves: ['e5'] });
    const output = call(result, { moves: ['c5'] });
    expect(output.ok).toBe(false);
    expect(output.error).toContain('pass newLine: true');
    expect(result.current.line?.moves.map((move) => move.san)).toEqual(['e5']);
  });
});

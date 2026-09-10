import { describe, expect, test, vi } from 'vitest';
import * as pins from '../tactic-pins.js';
import { buildTacticDetectionContext } from './context.js';

const PIN_AVAILABLE = '4k3/8/2n5/8/8/3B4/8/4K3 w - - 0 1';

describe('TacticFacts', () => {
  test('computes each shared board fact at most once per move', () => {
    // Forty-odd detectors run over every move of every game and every ply of
    // every engine line; several ask the same expensive question, and
    // `pins()` walks every slider's rays.
    const spy = vi.spyOn(pins, 'pins');
    const context = buildTacticDetectionContext(PIN_AVAILABLE, 'Bb5', 'white');

    const first = context.facts.pinsAfter();
    const second = context.facts.pinsAfter();

    expect(second).toBe(first);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('is lazy: a fact no detector asks for is never computed', () => {
    const spy = vi.spyOn(pins, 'pins');
    buildTacticDetectionContext(PIN_AVAILABLE, 'Bb5', 'white');

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('caches an exchange evaluation per square and side', () => {
    const context = buildTacticDetectionContext(PIN_AVAILABLE, 'Bb5', 'white');

    expect(context.facts.exchangeAfter('c6', 'w')).toBe(context.facts.exchangeAfter('c6', 'w'));
  });

  test('answers the trapped-piece question at the null-move position, where it is askable', () => {
    // `trappedPieces` needs the trapped side to move, and before the move it
    // is the mover's turn — asking there would always return nothing.
    const context = buildTacticDetectionContext(PIN_AVAILABLE, 'Bb5', 'white');

    expect(context.beforeNullMove).not.toBeNull();
    expect(() => context.facts.trappedBefore()).not.toThrow();
  });
});

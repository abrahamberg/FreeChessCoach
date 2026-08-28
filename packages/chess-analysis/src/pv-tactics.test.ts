import { describe, expect, test } from 'vitest';
import { annotatePvTactics } from './pv-tactics.js';

// Same fork setup as candidate-moves.test.ts: white knight f4-d5 forks the
// black rook on b6 and knight on f6.
const FORK_SETUP_FEN = '4k3/8/1r3n2/8/5N2/8/8/7K w - - 0 1';

describe('annotatePvTactics', () => {
  test('reports forkInPlies: 1 when the candidate\'s own first move creates the fork', () => {
    const annotation = annotatePvTactics(FORK_SETUP_FEN, ['Nd5']);

    expect(annotation.moveSan).toBe('Nd5');
    expect(annotation.steps).toHaveLength(1);
    expect(annotation.steps[0]?.createsFork).toBe(true);
    expect(annotation.forkInPlies).toBe(1);
  });

  test('reports forkInPlies: 3 when the fork only appears on the bot\'s second move (ply 3)', () => {
    // Kh2 (ply1, no fork) / Ke7 (ply2, opponent reply) / Nd5 (ply3, the fork) —
    // neither king move disturbs the rook/knight/knight fork setup.
    const annotation = annotatePvTactics(FORK_SETUP_FEN, ['Kh2', 'Ke7', 'Nd5']);

    expect(annotation.steps).toHaveLength(3);
    expect(annotation.steps[0]?.createsFork).toBe(false);
    expect(annotation.steps[1]?.createsFork).toBe(false);
    expect(annotation.steps[2]?.createsFork).toBe(true);
    expect(annotation.forkInPlies).toBe(3);
  });

  test('forkInPlies is null when no fork appears within the walked plies', () => {
    const annotation = annotatePvTactics(FORK_SETUP_FEN, ['Kg2']);

    expect(annotation.steps).toHaveLength(1);
    expect(annotation.steps[0]?.createsFork).toBe(false);
    expect(annotation.forkInPlies).toBeNull();
  });

  test('a PV shorter than maxPlies is walked in full, not padded', () => {
    const annotation = annotatePvTactics(FORK_SETUP_FEN, ['Nd5'], 6);

    expect(annotation.steps).toHaveLength(1);
  });

  test('stops cleanly at an illegal PV entry instead of throwing', () => {
    expect(() => annotatePvTactics(FORK_SETUP_FEN, ['Nd5', 'Zz9', 'Kg2'])).not.toThrow();

    const annotation = annotatePvTactics(FORK_SETUP_FEN, ['Nd5', 'Zz9', 'Kg2']);
    expect(annotation.steps).toHaveLength(1);
    expect(annotation.steps[0]?.moveSan).toBe('Nd5');
  });

  test('an empty PV returns no steps and forkInPlies: null', () => {
    const annotation = annotatePvTactics(FORK_SETUP_FEN, []);

    expect(annotation.steps).toHaveLength(0);
    expect(annotation.forkInPlies).toBeNull();
  });
});

import { describe, expect, test } from 'vitest';
import { renderAnnotatedMove, renderAnnotatedPgn, renderGameSoFarInline, type AnnotatedMoveLike } from './episode-context.js';

function moveLike(overrides: Partial<AnnotatedMoveLike> & { ply: number; moveSan: string }): AnnotatedMoveLike {
  return { quality: 'good', cpLoss: 0, bestLineSan: [], evalAfterCp: 0, reasons: [], ...overrides };
}

/**
 * `simple` is what a local-model session gets instead of the full NAG-glyph
 * annotation (coach-context.ts's `isLocal`) — a small quantized model has
 * been observed losing track of basic game facts (who won, what was
 * actually played) reading the full version, where a mate/check mark, a
 * quality glyph and several stacked commentary clauses can land on a single
 * move (e.g. "Qh6#★" or "Nxd5?? (lost ~277cp, best Nb4; ...; ...; ...)").
 */
describe('renderAnnotatedMove simple mode', () => {
  test('a sound move renders as bare SAN, no glyph', () => {
    const move = moveLike({ ply: 1, moveSan: 'e4', quality: 'good' });
    expect(renderAnnotatedMove(move, true)).toBe('1.e4');
  });

  test('an unsound move gets a plain-English quality word, not a symbol', () => {
    const move = moveLike({ ply: 13, moveSan: 'Nxd5', quality: 'blunder', cpLoss: 277, bestLineSan: ['Nb4'], reasons: ['Leaves knight on d5 attacked'] });
    expect(renderAnnotatedMove(move, true)).toBe('7.Nxd5 (blunder)');
  });

  test('drops cpLoss, the best-move hint, and the stacked reasons entirely', () => {
    const move = moveLike({ ply: 13, moveSan: 'Nxd5', quality: 'blunder', cpLoss: 277, bestLineSan: ['Nb4'], reasons: ['reason one', 'reason two'] });
    const rendered = renderAnnotatedMove(move, true);
    expect(rendered).not.toContain('277');
    expect(rendered).not.toContain('Nb4');
    expect(rendered).not.toContain('reason');
  });

  test('a checkmating move keeps its # — plain SAN is untouched, only the quality glyph is dropped', () => {
    const move = moveLike({ ply: 61, moveSan: 'Qh6#', quality: 'best' });
    expect(renderAnnotatedMove(move, true)).toBe('31.Qh6#');
  });

  test('default (cloud) behavior is unchanged — still the NAG glyph and full commentary', () => {
    const move = moveLike({ ply: 13, moveSan: 'Nxd5', quality: 'blunder', cpLoss: 277, bestLineSan: ['Nb4'], reasons: ['Leaves knight on d5 attacked'] });
    expect(renderAnnotatedMove(move)).toBe('7.Nxd5?? (lost ~277cp, best Nb4; Leaves knight on d5 attacked)');
  });
});

describe('renderAnnotatedPgn / renderGameSoFarInline simple mode', () => {
  const moves: AnnotatedMoveLike[] = [
    moveLike({ ply: 1, moveSan: 'e4', quality: 'good' }),
    moveLike({ ply: 2, moveSan: 'e5', quality: 'good' }),
    moveLike({ ply: 3, moveSan: 'Qh5', quality: 'blunder', cpLoss: 500, bestLineSan: ['Nf3'], reasons: ['walks into a fork'] })
  ];

  test('renders a plain, glyph-free move list', () => {
    expect(renderAnnotatedPgn(moves, true)).toBe('## This game (annotated)\n\n1.e4 e5 2.Qh5 (blunder)');
  });

  test('renderGameSoFarInline mirrors the same simple rendering', () => {
    expect(renderGameSoFarInline(moves, true)).toBe('1.e4 e5 2.Qh5 (blunder)');
  });
});

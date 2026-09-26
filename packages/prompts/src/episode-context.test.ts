import { describe, expect, test } from 'vitest';
import { renderAnnotatedMove, renderAnnotatedPgn, renderCurrentMoveBlock, renderGameSoFarInline, renderOtherMovesSummary, type AnnotatedMoveLike } from './episode-context.js';

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

describe('renderOtherMovesSummary: latest conversation in detail', () => {
  test('keeps one-line notes and appends the detailed summary of the latest episode at the end', () => {
    const text = renderOtherMovesSummary(
      [
        { ply: 4, note: 'older short note' },
        { ply: 14, note: 'short', detail: 'Student thought Nxd5 was safe. We explored 7...Nb4 8.e4 Nd3+.' }
      ],
      []
    );
    expect(text).toContain('older short note');
    expect(text.indexOf('older short note')).toBeLessThan(text.indexOf('Most recent conversation'));
    expect(text).toContain('Student thought Nxd5 was safe.');
    expect(text).toContain('do not greet the student again');
  });
});

// After 1.d4 d5 2.e3 Nc6 3.h3 Nf6 4.g4 g5 5.f3 Bg7 6.c3 e5 7.dxe5 Nxe5 8.f4 Nc4 — ply 16.
const AFTER_NC4 = 'r1bqk2r/ppp2pbp/5n2/3p2p1/2n2PP1/2P1P2P/PP6/RNBQKBNR w KQkq - 1 9';

describe('renderCurrentMoveBlock line orientation', () => {
  test('says the board already includes the played move, who is to move, and the base for an alternative', () => {
    const block = renderCurrentMoveBlock(16, AFTER_NC4, 'black', '(empty)', 'Nc4');
    expect(block).toContain('already include Nc4 — it is White to move');
    expect(block).toContain('BEFORE Nc4 (numbered Black\'s move 8)');
    expect(block).toContain('pass base: { moveNumber: 8, color: "white" }');
    expect(block).toContain("to continue from the real game position above, leave base out and start with White's move");
  });

  test('a first move addresses the game start as its base', () => {
    const block = renderCurrentMoveBlock(1, 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1', 'white', '(empty)', 'd4');
    expect(block).toContain('pass base: { moveNumber: 0, color: null }');
    expect(block).toContain('it is Black to move');
  });

  test('no note at the game start, where nothing has been played', () => {
    const block = renderCurrentMoveBlock(0, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'white', '(empty)', null);
    expect(block).not.toContain('Which position is which');
  });
});

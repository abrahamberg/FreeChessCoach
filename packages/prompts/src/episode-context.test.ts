import { currentMoveFacts } from '@freechesscoach/chess-analysis';
import type { PositionAnalysis } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { renderAnnotatedMove, renderAnnotatedPgn, renderCurrentMoveBlock, renderFocusFacts, renderGameSoFarInline, renderOtherMovesSummary, type AnnotatedMoveLike } from './episode-context.js';

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

describe('renderCurrentMoveBlock: what the move did', () => {
  // White's rook on d1 guards e1; Rd2 leaves it and …Re1# follows.
  const BEFORE = '4r1k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
  const AFTER = '4r1k1/5ppp/8/8/8/8/3R1PPP/6K1 b - - 1 1';
  const line = (moveSan: string, pvSan: string[]) => ({ moveSan, pvSan, cp: 0, mateIn: null });
  const analysis = { fen: BEFORE, bestMove: 'h3', lines: [line('h3', ['h3', 'h6'])] } as unknown as PositionAnalysis;
  const postMoveAnalysis = { fen: AFTER, bestMove: 'Re1#', lines: [line('Re1#', ['Re1#'])] } as unknown as PositionAnalysis;

  test('a blunder shows what it gave up and the better move', () => {
    const moveFacts = currentMoveFacts({ fenBefore: BEFORE, playedSan: 'Rd2', best: { san: 'h3', line: ['h3', 'h6'] }, continuation: ['Re1#'] });
    const block = renderCurrentMoveBlock(1, AFTER, 'white', '(empty)', 'Rd2', { analysis, postMoveAnalysis, moveFacts });

    expect(block).toContain('What the move did:');
    expect(block).toContain('Gave up: the rook stops guarding e1, where Re1# follows.');
    expect(block).toContain('Best instead:');
    expect(block).toContain('- h3 moves the pawn from h2 to h3.');
    expect(block).toContain('At the end of its line, material is level.');
  });

  test('the best move shows no "Best instead" and, when it is a trade, nothing loose', () => {
    const moveFacts = currentMoveFacts({ fenBefore: BEFORE, playedSan: 'h3', best: { san: 'h3', line: ['h3', 'h6'] }, continuation: ['h6'] });
    const block = renderCurrentMoveBlock(1, AFTER, 'white', '(empty)', 'h3', { analysis, moveFacts });

    expect(block).toContain('What the move did:');
    expect(block).not.toContain('Best instead');
    expect(block).not.toContain('Loose after it');
  });

  test('stays within ten lines', () => {
    const moveFacts = currentMoveFacts({ fenBefore: BEFORE, playedSan: 'Rd2', best: { san: 'h3', line: ['h3', 'h6'] }, continuation: ['Re1#'] });
    const block = renderCurrentMoveBlock(1, AFTER, 'white', '(empty)', 'Rd2', { analysis, postMoveAnalysis, moveFacts });
    const section = block.slice(block.indexOf('What the move did:'), block.indexOf('## Your thread ledger'));
    expect(section.trim().split('\n').length).toBeLessThanOrEqual(10);
  });
});

describe('renderFocusFacts', () => {
  const loose = [{ square: 'c4', piece: 'b', owner: 'w', tier: 'free' }] as const;
  const options = { checks: ['Rh8+'], captures: ['Bxd5'], threats: [] };

  test('loose pieces before and after', () => {
    expect(renderFocusFacts({ loose: { before: [], after: [...loose] } })).toBe(
      'For what you two are working on:\n- Loose before the move: nothing.\n- Loose after it: the white bishop on c4 (undefended).'
    );
  });

  test("the opponent's and the student's options are labelled as things to look at", () => {
    const text = renderFocusFacts({ opponentNext: options, ownBefore: options });
    expect(text).toContain("The opponent's options after it (to look at, not verdicts): checks Rh8+; captures Bxd5; nothing to win.");
    expect(text).toContain('Your options before it (to look at, not verdicts): checks Rh8+; captures Bxd5; nothing to win.');
  });

  test("the moved piece's new square", () => {
    expect(renderFocusFacts({ newSquare: { piece: { piece: 'b', square: 'd5' }, safe: false } })).toContain('The bishop on d5 can be won there.');
  });

  test('the opposition', () => {
    expect(renderFocusFacts({ endgame: [{ kind: 'opposition' }] })).toContain('Endgame: takes the opposition');
  });

  test('nothing to say renders nothing, and never more than eight lines', () => {
    expect(renderFocusFacts({})).toBe('');
    const all = renderFocusFacts({ loose: { before: [], after: [] }, opponentNext: options, ownBefore: options, newSquare: { piece: { piece: 'n', square: 'f3' }, safe: true }, endgame: [{ kind: 'opposition' }] });
    expect(all.split('\n').length - 1).toBeLessThanOrEqual(8);
  });
});

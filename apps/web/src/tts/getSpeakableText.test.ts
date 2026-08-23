import { describe, expect, test } from 'vitest';
import type { CoachMessage } from '../hooks/useCoachChat.js';
import { getSpeakableText } from './getSpeakableText.js';

function msg(role: CoachMessage['role'], text: string): CoachMessage {
  return { id: 'x', role, text };
}

describe('getSpeakableText', () => {
  test('returns plain assistant prose unchanged', () => {
    expect(getSpeakableText(msg('assistant', 'Good move. Keep your king safe.'))).toBe('Good move. Keep your king safe.');
  });

  test('returns null for a user message', () => {
    expect(getSpeakableText(msg('user', 'what should I play?'))).toBeNull();
  });

  test('returns null for blank text', () => {
    expect(getSpeakableText(msg('assistant', '   '))).toBeNull();
  });

  test('returns null for a [board_move] sentinel', () => {
    expect(getSpeakableText(msg('assistant', '[board_move] I played e4 (position now: fen-here)'))).toBeNull();
  });

  test('returns null for a [player_move] sentinel', () => {
    expect(getSpeakableText(msg('user', '[player_move] I played e4.'))).toBeNull();
  });

  test('returns null for a position_divider sentinel', () => {
    expect(getSpeakableText(msg('assistant', '[position_divider]|12|Nf3'))).toBeNull();
  });

  test('returns null for an annotation_note sentinel', () => {
    expect(getSpeakableText(msg('assistant', '[annotation_note]|{"arrows":[],"highlights":[]}'))).toBeNull();
  });

  test('returns null for a position_context sentinel', () => {
    expect(getSpeakableText(msg('user', '[position_context] Back at move 12 (white), after Nf3: what about here?'))).toBeNull();
  });

  test('returns null for a diverged_line_start sentinel', () => {
    expect(
      getSpeakableText(msg('assistant', '[diverged_line_start]|{"basePly":10,"sanMoves":["a3"],"resultFen":"fen"}'))
    ).toBeNull();
  });

  test('returns null for a diverged_line sentinel', () => {
    expect(
      getSpeakableText(msg('user', '[diverged_line] Exploring from move 26 (white): 26.a3 f6 (position now: fen): what now?'))
    ).toBeNull();
  });

  test('unwraps **bold** spans to plain text', () => {
    expect(getSpeakableText(msg('assistant', 'That was a **great** move.'))).toBe('That was a great move.');
  });

  test('converts an arrow token to spoken form', () => {
    expect(getSpeakableText(msg('assistant', 'Consider [e2-e4] here.'))).toBe('Consider e2 to e4 here.');
  });

  test('converts multiple arrow tokens and bold spans together', () => {
    expect(getSpeakableText(msg('assistant', '**Play** [e2-e4], not [d2-d4].'))).toBe('Play e2 to e4, not d2 to d4.');
  });
});

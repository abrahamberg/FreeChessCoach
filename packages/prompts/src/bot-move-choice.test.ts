import { describe, expect, test } from 'vitest';
import { buildBotMoveChoiceMessages, type BotMoveChoiceInput } from './bot-move-choice.js';

function baseInput(overrides: Partial<BotMoveChoiceInput> = {}): BotMoveChoiceInput {
  return {
    botName: 'Trappy Tom',
    botDescription: 'Lures you into forks and pins rather than chasing the objectively best move.',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    candidates: [
      { moveSan: 'Nf3', cp: 20, mateIn: null, score: 0.55, forkInPlies: 3 },
      { moveSan: 'e4', cp: 25, mateIn: null, score: 0.52, forkInPlies: null }
    ],
    ...overrides
  };
}

describe('buildBotMoveChoiceMessages', () => {
  test('the user message carries the persona, fen, and full candidate list', () => {
    const messages = buildBotMoveChoiceMessages(baseInput());
    expect(messages.user).toContain('Trappy Tom');
    expect(messages.user).toContain('Lures you into forks and pins rather than chasing the objectively best move.');
    expect(messages.user).toContain('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(messages.user).toContain('Nf3');
    expect(messages.user).toContain('e4');
    expect(messages.user).toContain('"forkInPlies":3');
  });

  test('the system message instructs JSON-only output constrained to the candidate list', () => {
    const messages = buildBotMoveChoiceMessages(baseInput());
    expect(messages.system).toContain('JSON');
    expect(messages.system.toLowerCase()).toContain('candidate');
    expect(messages.system.toLowerCase()).toContain('never invent a move');
  });

  test('an empty candidate list still produces a well-formed prompt', () => {
    const messages = buildBotMoveChoiceMessages(baseInput({ candidates: [] }));
    expect(messages.user).toContain('[]');
  });
});

import { describe, expect, test } from 'vitest';
import { basePuzzleCoachInput } from './fixtures.js';
import { PERSONA_VOICE } from './coach-persona.js';
import { buildPuzzleCoachSystemPrompt } from './puzzle-coach-system.js';

describe('buildPuzzleCoachSystemPrompt', () => {
  test('leads with the student persona voice', () => {
    const { staticPart } = buildPuzzleCoachSystemPrompt(basePuzzleCoachInput({ persona: 'shark' }));
    expect(PERSONA_VOICE.shark.length).toBeGreaterThan(0);
    expect(staticPart.startsWith(PERSONA_VOICE.shark)).toBe(true);
  });

  test('hands the coach the engine analysis of the position', () => {
    const { dynamicPart } = buildPuzzleCoachSystemPrompt(basePuzzleCoachInput({ positionAnalysis: 'Best move: Nf6 (+0.3).' }));
    expect(dynamicPart).toContain('## Engine analysis of this position');
    expect(dynamicPart).toContain('Best move: Nf6 (+0.3).');
  });

  test('says so when the engine analysis is unavailable, rather than leaving a gap', () => {
    const { dynamicPart } = buildPuzzleCoachSystemPrompt(basePuzzleCoachInput({ positionAnalysis: null }));
    expect(dynamicPart).toContain('engine analysis unavailable');
  });

  test('annotates every remaining move of the known line with checked facts', () => {
    // Start position: moves[0] e2e4 is the setup; e7e5, g1f3, b8c6 remain.
    const { dynamicPart } = buildPuzzleCoachSystemPrompt(basePuzzleCoachInput());
    expect(dynamicPart).toContain('Student plays: e5 — black moves the pawn from e7 to e5');
    expect(dynamicPart).toContain("Opponent's expected reply: Nf3 — white moves the knight from g1 to f3");
    expect(dynamicPart).toContain('Student plays: Nc6 — black moves the knight from b8 to c6');
    expect(dynamicPart).toContain('Themes: fork.');
  });

  test('requires checking a move before calling it wrong', () => {
    const { staticPart } = buildPuzzleCoachSystemPrompt(basePuzzleCoachInput());
    expect(staticPart).toContain('## Verify before you say it');
    expect(staticPart).toContain('check_moves on it');
  });

  test('carries only a results ledger from earlier positions, each position being its own conversation', () => {
    const { dynamicPart } = buildPuzzleCoachSystemPrompt(
      basePuzzleCoachInput({ previousResults: [{ index: 1, result: 'solved' }, { index: 2, result: 'failed' }] })
    );
    expect(dynamicPart).toContain('## Earlier in this session');
    expect(dynamicPart).toContain('#1 solved, #2 failed');
  });

  test('once the line is played out, the coach asks before advancing rather than jumping to the next practice', () => {
    const { dynamicPart } = buildPuzzleCoachSystemPrompt(
      basePuzzleCoachInput({ currentItem: { ...basePuzzleCoachInput().currentItem, currentPly: 4 } })
    );
    expect(dynamicPart).toContain('ask whether they are ready to move on; call advance_puzzle once they agree');
  });
});

import { describe, expect, test } from 'vitest';
import { buildPuzzleCoachSystemPrompt } from './puzzle-coach-system.js';
import { basePuzzleCoachInput as baseInput } from './fixtures.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('buildPuzzleCoachSystemPrompt', () => {
  test('staticPart is identical across different assignments — no per-student axis for this session type', () => {
    const a = buildPuzzleCoachSystemPrompt(baseInput());
    const b = buildPuzzleCoachSystemPrompt(baseInput({ reason: 'A completely different reason.' }));
    expect(a.staticPart).toBe(b.staticPart);
  });

  test('staticPart tells the coach about every reused tool and advance_puzzle, but not show_position', () => {
    const { staticPart } = buildPuzzleCoachSystemPrompt(baseInput());
    // show_position addresses a real game's move-pairs ({ moveNumber, color }
    // — packages/prompts/src/tools.ts) which a puzzle session has no
    // equivalent of; Task 59.4 drops it from the tool set entirely, so it
    // must not appear here as guidance for a tool the coach doesn't have.
    expect(staticPart).not.toContain('show_position');
    expect(staticPart).toContain('annotate_board');
    expect(staticPart).toContain('expect_move');
    expect(staticPart).toContain('hypothetical_line');
    expect(staticPart).toContain('advance_puzzle');
    expect(staticPart).toContain('result: "solved"');
    expect(staticPart).toContain('result: "failed"');
    expect(staticPart).toContain('result: "skipped"');
  });

  test('staticPart tells the coach to hint before revealing and to explain rather than just grade', () => {
    const { staticPart } = buildPuzzleCoachSystemPrompt(baseInput());
    expect(staticPart).toContain('HINT BEFORE YOU REVEAL');
    expect(staticPart).toContain("don't just say \"correct\"");
  });

  test('staticPart writes in plain prose with no markdown', () => {
    const { staticPart } = buildPuzzleCoachSystemPrompt(baseInput());
    expect(staticPart).toContain('no markdown');
    expect(staticPart).toContain('no **bold**');
  });

  test('dynamicPart states the assignment reason up front', () => {
    const { dynamicPart } = buildPuzzleCoachSystemPrompt(baseInput());
    expect(dynamicPart).toContain('You missed several knight forks in your last few games.');
    expect(dynamicPart).toContain('Why these puzzles');
  });

  test('dynamicPart states the puzzle\'s 1-based position and total count', () => {
    const { dynamicPart } = buildPuzzleCoachSystemPrompt(baseInput({ totalCount: 5, currentItem: { ...baseInput().currentItem, index: 2 } }));
    expect(dynamicPart).toContain('This puzzle (2 of 5)');
  });

  test('dynamicPart resolves the opponent\'s setup move out of the starting position and lists the rest of the known solution as student/opponent turns', () => {
    const { dynamicPart } = buildPuzzleCoachSystemPrompt(baseInput());
    // moves[0] "e2e4" is the setup move played to reach the real start —
    // its SAN ("e4") must not appear labeled as something the student plays.
    expect(dynamicPart).not.toContain('Student plays: e4');
    expect(dynamicPart).toContain('Student plays: e5');
    expect(dynamicPart).toContain("Opponent's expected reply: Nf3");
    expect(dynamicPart).toContain('Student plays: Nc6');
    // The starting FEN shown is the position AFTER the setup move — active
    // color has flipped from White (the puzzle FEN's own side to move) to
    // Black, and it is not simply the raw input FEN repeated verbatim.
    expect(dynamicPart).not.toContain(START_FEN);
    expect(dynamicPart).toMatch(/ b KQkq/);
  });

  test('dynamicPart never leaks the known solution into staticPart', () => {
    const { staticPart } = buildPuzzleCoachSystemPrompt(baseInput());
    expect(staticPart).not.toContain('Nc6');
  });

  test('a solution line of just the setup move renders a graceful fallback instead of an empty line', () => {
    const { dynamicPart } = buildPuzzleCoachSystemPrompt(baseInput({ currentItem: { fen: START_FEN, moves: ['e2e4'], index: 1 } }));
    expect(dynamicPart).toContain('(no solution line recorded)');
  });
});

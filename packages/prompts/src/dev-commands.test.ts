import { describe, expect, test } from 'vitest';
import { buildCoachSystemPrompt } from './coach-system.js';
import { DEV_COMMANDS } from './dev-commands.js';
import { baseCoachInput, basePuzzleCoachInput } from './fixtures.js';
import { buildPuzzleCoachSystemPrompt } from './puzzle-coach-system.js';

describe('DEV_COMMANDS', () => {
  test('leads the coach prompt, ahead of the persona voice, only when enabled', () => {
    const on = buildCoachSystemPrompt(baseCoachInput({ persona: 'shark', devCommands: true }));
    expect(on.staticPart.startsWith(DEV_COMMANDS)).toBe(true);

    const off = buildCoachSystemPrompt(baseCoachInput({ persona: 'shark' }));
    expect(off.staticPart).not.toContain('/dev');
    expect(off.staticPart).toBe(buildCoachSystemPrompt(baseCoachInput({ persona: 'shark', devCommands: false })).staticPart);
  });

  test('leads the puzzle coach prompt only when enabled', () => {
    expect(buildPuzzleCoachSystemPrompt(basePuzzleCoachInput({ devCommands: true })).staticPart.startsWith(DEV_COMMANDS)).toBe(true);
    expect(buildPuzzleCoachSystemPrompt(basePuzzleCoachInput()).staticPart).not.toContain('/dev');
  });

  test('names the /dev prefix and puts it above every other rule', () => {
    expect(DEV_COMMANDS).toContain('/dev');
    expect(DEV_COMMANDS).toMatch(/over(rides)? .*rule/i);
  });
});

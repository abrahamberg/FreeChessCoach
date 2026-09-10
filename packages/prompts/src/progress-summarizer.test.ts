import { describe, expect, test } from 'vitest';
import { MISTAKE_CATEGORIES } from '@freechesscoach/shared';
import { buildSummarizerMessages } from './progress-summarizer.js';
import { baseSummarizerInput as baseInput } from './fixtures.js';

describe('buildSummarizerMessages', () => {
  test('system prompt lists all 13 categories and forbids inventing new ones', () => {
    const { system } = buildSummarizerMessages(baseInput());
    for (const category of MISTAKE_CATEGORIES) {
      expect(system).toContain(category);
    }
    expect(system).toContain('ONLY these');
  });

  test('system prompt explains the focus-area state machine and that selection is programmatic', () => {
    const { system } = buildSummarizerMessages(baseInput());
    expect(system).toContain('diagnosis code');
    expect(system).toContain('system selects them automatically');
  });

  test('user message includes the transcript and already-recorded findings', () => {
    const { user } = buildSummarizerMessages(
      baseInput({ transcript: 'UNIQUE_TRANSCRIPT_MARKER', recordedFindings: 'UNIQUE_FINDINGS_MARKER' })
    );
    expect(user).toContain('UNIQUE_TRANSCRIPT_MARKER');
    expect(user).toContain('UNIQUE_FINDINGS_MARKER');
  });

  test('empty focus areas render the "(none yet…)" fallback in the user message', () => {
    const { user } = buildSummarizerMessages(baseInput({ focusAreas: [] }));
    expect(user).toContain('none yet');
  });

  test('the user message names the session goal, and the system prompt makes the summary lead with whether it landed', () => {
    const { system, user } = buildSummarizerMessages(baseInput());

    expect(user).toContain('Goal for this session:');
    expect(system).toContain("Lead with the session's goal");
  });

  test('a plan stored before sessionGoal existed drops the goal line', () => {
    const input = baseInput();
    const { user } = buildSummarizerMessages({ ...input, plan: { ...input.plan, sessionGoal: '' } });

    expect(user).not.toContain('Goal for this session:');
  });
});

import { describe, test, expect } from 'vitest';
import { buildCoachSystemPrompt } from './coach-system.js';
import { baseCoachInput } from './fixtures.js';

/**
 * coach-system.ts and coach-persona.ts point at each other's rules in plain
 * English inside the prompt text itself (e.g. "see 'GET THE BOARD THERE
 * FIRST' above") — that has to stay prose, since the model reads it, not an
 * identifier. A rename or reword during a prompt rewrite can silently orphan
 * one of these. This test is the guardrail: every {reference, anchor} pair
 * below asserts the anchor phrase a reference points at still exists
 * verbatim. If a rewrite intentionally reworks an anchor, update the pair
 * here in the same change — a failure here means either fix the anchor text
 * or fix the reference that quotes it.
 */
const CROSS_REFERENCES: { reference: string; anchor: string }[] = [
  { reference: "howYouRunTheSession point 3 ('GET THE BOARD THERE FIRST') is invoked by SESSION_FLOW's closing line", anchor: 'GET THE BOARD THERE FIRST' },
  { reference: "howYouRunTheSession point 1 ('ask only real questions') is invoked by SESSION_FLOW's walkthrough instructions", anchor: 'ASK ONLY REAL QUESTIONS' },
  { reference: "howYouRunTheSession point 8 ('diagnose before you explain') is invoked by SESSION_FLOW's walkthrough instructions", anchor: 'DIAGNOSE BEFORE YOU EXPLAIN' },
  { reference: "SESSION_GOALS is invoked by both session flows ('see \"What the session is for\"') and by yourStudent", anchor: '## What the session is for' },
  { reference: "ENGINE_VISIBILITY is invoked by howYouRunTheSession's closing line ('See \"Engine visibility\" below')", anchor: '## Engine visibility' },
  { reference: "PERSONA_VOICE's BOARD_DISCIPLINE_REMINDER refers to show_position discipline defined in howYouRunTheSession", anchor: 'show_position' },
  { reference: "CONVERSATION_THREADING's durable-memory note refers to record_move_note, defined in yourToolsAndWhenToUseThem", anchor: 'record_move_note' },
  { reference: "GROUND_TRUTH points at check_moves as the free legality check every unverified move goes through", anchor: 'check_moves' }
];

describe('coach-system.ts internal cross-references', () => {
  const { staticPart } = buildCoachSystemPrompt(baseCoachInput({ persona: 'commander' }));

  test.each(CROSS_REFERENCES)('anchor for "$reference" is still present verbatim', ({ anchor }) => {
    expect(staticPart).toContain(anchor);
  });
});

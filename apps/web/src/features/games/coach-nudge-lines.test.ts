import { COACH_PERSONAS, type CoachNudgeKind } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { coachNudgeLine, IDLE_TOPICS, pickedGameLine } from './coach-nudge-lines.js';

const KINDS: CoachNudgeKind[] = [
  'practice',
  'import_first',
  'first_coaching',
  'first_play',
  'import_more',
  'coach_game',
  'play_coach',
  'idle'
];

describe('coachNudgeLine', () => {
  test('every coach has a line for every situation and idle topic, whatever the pick', () => {
    for (const persona of COACH_PERSONAS) {
      for (const kind of KINDS) {
        for (const idleTopic of IDLE_TOPICS) {
          for (const pick of [0, 0.5, 0.999]) {
            expect(coachNudgeLine({ persona, kind, remaining: 4, idleTopic, pick }).length).toBeGreaterThan(20);
          }
        }
      }
    }
  });

  test('repeating situations have alternatives; first-time ones say the same thing every time', () => {
    const lines = (kind: CoachNudgeKind) =>
      new Set([0, 0.4, 0.8].map((pick) => coachNudgeLine({ persona: 'commander', kind, remaining: 4, pick })));
    expect(lines('coach_game').size).toBe(3);
    expect(lines('first_coaching').size).toBe(1);
  });

  test('the import line counts the games still needed, in the singular for one', () => {
    expect(coachNudgeLine({ persona: 'general', kind: 'import_first', remaining: 1, pick: 0 })).toContain('1 more game,');
    expect(coachNudgeLine({ persona: 'general', kind: 'import_first', remaining: 12, pick: 0 })).toContain('12 more games');
  });

  test('every coach tells a returning student to play 10-minute rapid on Lichess or Chess.com', () => {
    for (const persona of COACH_PERSONAS) {
      for (const pick of [0, 0.5, 0.999]) {
        const line = coachNudgeLine({ persona, kind: 'import_more', pick });
        expect(line).toContain('10-minute rapid');
        expect(line).toMatch(/Lichess or Chess\.com/);
      }
    }
  });

  test('every coach has three ways to say they picked the imported game', () => {
    for (const persona of COACH_PERSONAS) {
      const lines = new Set([0, 0.4, 0.8].map((pick) => pickedGameLine(persona, pick)));
      expect(lines.size).toBe(3);
    }
  });
});

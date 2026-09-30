import { COACH_PERSONAS } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { PERSONA_VOICE } from '../coach-persona.js';
import { PERSONA_WORDS } from '../persona-words.js';
import { buildCourseVoiceBlock } from './course-voice.js';

describe('buildCourseVoiceBlock', () => {
  test.each(COACH_PERSONAS)('%s', (persona) => {
    expect(buildCourseVoiceBlock(persona)).toMatchSnapshot();
  });

  test('the course and the chat use the same identity and word bank', () => {
    for (const [persona, words] of Object.entries(PERSONA_WORDS)) {
      const block = buildCourseVoiceBlock(persona as keyof typeof PERSONA_WORDS);
      const chat = PERSONA_VOICE[persona as keyof typeof PERSONA_WORDS];
      expect(block).toContain(`You are ${words.name}, a chess coach who is ${words.identity}.`);
      expect(chat).toContain(`You are ${words.name}, a chess coach who is ${words.identity}.`);
      expect(block).toContain(words.wordBank);
      expect(chat).toContain(words.wordBank);
    }
  });

  test('general coaches get the neutral course voice, and no chat-only rules', () => {
    expect(buildCourseVoiceBlock('general')).toContain('a calm, clear club coach');
    expect(buildCourseVoiceBlock('general_female')).toBe(buildCourseVoiceBlock('general'));
    for (const persona of COACH_PERSONAS) {
      const block = buildCourseVoiceBlock(persona);
      expect(block).not.toMatch(/show_position|greet/i);
      expect(block).toContain('"great question"');
      expect(block.split('\n')).toHaveLength(5);
    }
  });
});

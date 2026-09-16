import { COACH_PERSONAS } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { PERSONA_VOICES } from './tts.js';

describe('PERSONA_VOICES', () => {
  test('every coach persona has an OpenAI voice mapped', () => {
    for (const persona of COACH_PERSONAS) {
      expect(PERSONA_VOICES[persona]).toBeTruthy();
    }
  });

  test('"general" and "general_female" use different voices despite the identical prompt', () => {
    expect(PERSONA_VOICES.general).not.toBe(PERSONA_VOICES.general_female);
  });

  test('no two personas accidentally share a voice', () => {
    const voices = Object.values(PERSONA_VOICES);
    expect(new Set(voices).size).toBe(voices.length);
  });
});

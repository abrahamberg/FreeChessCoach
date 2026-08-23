import { COACH_PERSONAS } from '@chess-coach/shared';
import { describe, expect, test } from 'vitest';
import { computeTtsCredits, PERSONA_VOICES } from './tts.js';

describe('computeTtsCredits', () => {
  test('rounds up to the nearest whole credit', () => {
    expect(computeTtsCredits(1000, 5)).toBe(5);
    expect(computeTtsCredits(1, 5)).toBe(1);
    expect(computeTtsCredits(1500, 5)).toBe(8);
  });

  test('zero-length text costs nothing', () => {
    expect(computeTtsCredits(0, 5)).toBe(0);
  });
});

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

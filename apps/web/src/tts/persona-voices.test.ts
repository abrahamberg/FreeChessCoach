import { COACH_PERSONAS } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { PERSONA_VOICES } from './persona-voices.js';

describe('PERSONA_VOICES', () => {
  test('has exactly one Kokoro voice per coach persona', () => {
    expect(Object.keys(PERSONA_VOICES).sort()).toEqual([...COACH_PERSONAS].sort());
  });

  test('every voice id is non-empty', () => {
    for (const voice of Object.values(PERSONA_VOICES)) {
      expect(voice.length).toBeGreaterThan(0);
    }
  });
});

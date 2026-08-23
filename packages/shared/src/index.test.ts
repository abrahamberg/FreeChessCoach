import { expect, test } from 'vitest';
import { COACH_PERSONAS, COACH_PERSONA_INFO, MISTAKE_CATEGORIES, RATING_BANDS } from './index.js';

test('mistake taxonomy has the 13 agreed categories', () => {
  expect(MISTAKE_CATEGORIES).toHaveLength(13);
  expect(new Set(MISTAKE_CATEGORIES).size).toBe(13);
});

test('rating bands are the 4 agreed bands in order', () => {
  expect(RATING_BANDS).toEqual(['novice', 'improving', 'club', 'advanced']);
});

test('coach personas are the 8 agreed personas, general and general_female first', () => {
  expect(COACH_PERSONAS).toEqual([
    'general',
    'general_female',
    'commander',
    'scholar',
    'huntress',
    'shark',
    'sunzi',
    'gambler'
  ]);
  expect(new Set(COACH_PERSONAS).size).toBe(8);
});

test('every coach persona has display info, including a voice profile (gender/age) for voice selection', () => {
  for (const persona of COACH_PERSONAS) {
    expect(COACH_PERSONA_INFO[persona].label).toBeTruthy();
    expect(COACH_PERSONA_INFO[persona].avatar).toBeTruthy();
    expect(COACH_PERSONA_INFO[persona].voiceProfile).toBeTruthy();
  }
});

test('"general" and "general_female" share every field except voiceProfile — same coach, only the voice differs', () => {
  const { voiceProfile: generalVoice, ...general } = COACH_PERSONA_INFO.general;
  const { voiceProfile: generalFemaleVoice, ...generalFemale } = COACH_PERSONA_INFO.general_female;
  expect(general).toEqual(generalFemale);
  expect(generalVoice).not.toBe(generalFemaleVoice);
});

test('only the gambler and street shark personas are marked explicit (coaches.md: profanity/insults are part of their character)', () => {
  const explicitPersonas = COACH_PERSONAS.filter((persona) => COACH_PERSONA_INFO[persona].explicit);
  expect(explicitPersonas.sort()).toEqual(['gambler', 'shark']);
});

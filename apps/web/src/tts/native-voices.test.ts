import { describe, expect, test } from 'vitest';
import { chooseNativeVoice } from './native-voices.js';

function voice(name: string, lang: string, localService = true): SpeechSynthesisVoice {
  return { name, lang, localService, default: false, voiceURI: name };
}

const MAC = [voice('Samantha', 'en-US'), voice('Alex', 'en-US'), voice('Daniel', 'en-GB'), voice('Thomas', 'fr-FR')];

describe('chooseNativeVoice', () => {
  test('picks a male voice for a male coach and a female one for a female coach', () => {
    expect(chooseNativeVoice('general', MAC).voice?.name).toBe('Alex');
    expect(chooseNativeVoice('general_female', MAC).voice?.name).toBe('Samantha');
  });

  test('prefers a British voice for the Scholar', () => {
    expect(chooseNativeVoice('scholar', MAC).voice?.name).toBe('Daniel');
  });

  test('tells "Female" from "Male" in Google voice names', () => {
    const google = [voice('Google UK English Male', 'en-GB', false), voice('Google UK English Female', 'en-GB', false)];
    expect(chooseNativeVoice('huntress', google).voice?.name).toBe('Google UK English Female');
    expect(chooseNativeVoice('commander', google).voice?.name).toBe('Google UK English Male');
  });

  test('uses the persona rate and pitch when the gender matches', () => {
    expect(chooseNativeVoice('commander', MAC)).toMatchObject({ rate: 1.25, pitch: 0.8 });
  });

  test('leans pitch toward the gender when no voice name reveals one', () => {
    const android = [voice('English United States', 'en-US')];
    const choice = chooseNativeVoice('general', android);
    expect(choice.voice?.name).toBe('English United States');
    expect(choice.pitch).toBeCloseTo(0.8);
  });

  test('falls back to the device default when there is no English voice', () => {
    expect(chooseNativeVoice('general', [voice('Thomas', 'fr-FR')]).voice).toBeNull();
  });
});

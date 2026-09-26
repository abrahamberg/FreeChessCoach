import { describe, expect, test } from 'vitest';
import { checkUnlockPhrase } from './unlock-phrase-strength.js';

describe('checkUnlockPhrase', () => {
  test.each(['abc123123', 'opensesemi', 'letmein123', 'Password2024!', 'qwertyuiop12', 'chessmaster99'])('refuses %s', async (phrase) => {
    const verdict = await checkUnlockPhrase(phrase);
    expect(verdict.ok).toBe(false);
    expect(verdict.problem).toMatch(/unrelated words/);
  });

  test.each(['correct horse battery', 'knight takes pawn on e5', 'blue-river-lamp-42'])('accepts %s', async (phrase) => {
    expect((await checkUnlockPhrase(phrase)).ok).toBe(true);
  });

  test("counts the user's own name and email as guessable", async () => {
    const phrase = 'danielabrahamberg';
    expect((await checkUnlockPhrase(phrase)).ok).toBe(true);
    expect((await checkUnlockPhrase(phrase, ['daniel', 'abrahamberg'])).ok).toBe(false);
  });
}, 20_000);

import { afterEach, describe, expect, test } from 'vitest';
import { DEFAULT_LOCAL_TTS_PORT, localTtsBaseUrl, parseLocalTtsPort, readLocalTtsPort, writeLocalTtsPort } from './local-tts-settings.js';

afterEach(() => window.localStorage.clear());

describe('parseLocalTtsPort', () => {
  test.each([
    ['8880', 8880],
    [' 9000 ', 9000],
    ['1', 1],
    ['65535', 65535]
  ])('%s -> %s', (input, expected) => {
    expect(parseLocalTtsPort(input)).toBe(expected);
  });

  test.each(['', '0', '65536', '88 80', '8880.5', '-1', 'abc', '123456', 'http://localhost:8880'])('rejects %j', (input) => {
    expect(parseLocalTtsPort(input)).toBeNull();
  });
});

describe('saved port', () => {
  test('defaults to 8880 when nothing is saved', () => {
    expect(readLocalTtsPort()).toBe(DEFAULT_LOCAL_TTS_PORT);
  });

  test('round-trips, and ignores a corrupt saved value', () => {
    writeLocalTtsPort(9000);
    expect(readLocalTtsPort()).toBe(9000);
    window.localStorage.setItem('fcc.localTtsPort', 'nope');
    expect(readLocalTtsPort()).toBe(DEFAULT_LOCAL_TTS_PORT);
  });

  test('builds the base URL', () => {
    expect(localTtsBaseUrl(9000)).toBe('http://localhost:9000');
  });
});

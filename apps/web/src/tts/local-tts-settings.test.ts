import { afterEach, describe, expect, test } from 'vitest';
import { DEFAULT_LOCAL_TTS_URL, normalizeLocalTtsUrl, readLocalTtsUrl, writeLocalTtsUrl } from './local-tts-settings.js';

afterEach(() => window.localStorage.clear());

describe('normalizeLocalTtsUrl', () => {
  test.each([
    // localhost with no port means Kokoro's own 8880
    ['localhost', 'http://localhost:8880'],
    ['http://localhost', 'http://localhost:8880'],
    ['127.0.0.1', 'http://127.0.0.1:8880'],
    ['  http://localhost:8880/  ', 'http://localhost:8880'],
    // any other host with no port means the scheme default (80 for http)
    ['192.168.1.5', 'http://192.168.1.5'],
    ['voice.example.com', 'http://voice.example.com'],
    ['https://voice.example.com', 'https://voice.example.com'],
    // a typed port is always kept, including one that is a scheme default
    ['localhost:9000', 'http://localhost:9000'],
    ['192.168.1.5:8880', 'http://192.168.1.5:8880'],
    ['http://localhost:80', 'http://localhost:80'],
    ['http://192.168.1.5:9000/v1/', 'http://192.168.1.5:9000'],
    ['voice.example.com/tts/v1', 'http://voice.example.com/tts'],
    // a bare number is a localhost port
    ['9000', 'http://localhost:9000'],
    ['80', 'http://localhost:80']
  ])('%s -> %s', (input, expected) => {
    expect(normalizeLocalTtsUrl(input)).toBe(expected);
  });

  test.each(['', '   ', 'ftp://localhost', 'http://', 'localhost:0', 'localhost:65536', '99999', 'not a url'])(
    'rejects %j',
    (input) => {
      expect(normalizeLocalTtsUrl(input)).toBeNull();
    }
  );
});

describe('saved address', () => {
  test('defaults to localhost:8880', () => {
    expect(readLocalTtsUrl()).toBe(DEFAULT_LOCAL_TTS_URL);
    expect(DEFAULT_LOCAL_TTS_URL).toBe('http://localhost:8880');
  });

  test('round-trips, clearing goes back to the default, and a corrupt value is ignored', () => {
    writeLocalTtsUrl('http://192.168.1.5:9000');
    expect(readLocalTtsUrl()).toBe('http://192.168.1.5:9000');
    writeLocalTtsUrl(null);
    expect(readLocalTtsUrl()).toBe(DEFAULT_LOCAL_TTS_URL);
    window.localStorage.setItem('fcc.localTtsUrl', 'ftp://nope');
    expect(readLocalTtsUrl()).toBe(DEFAULT_LOCAL_TTS_URL);
  });
});

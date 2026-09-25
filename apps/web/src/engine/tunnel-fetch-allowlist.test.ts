import { describe, expect, test } from 'vitest';
import { isAllowedTunnelFetchUrl } from './tunnel-engine-handlers.js';

describe('isAllowedTunnelFetchUrl', () => {
  test('allows chess-api.com only', () => {
    expect(isAllowedTunnelFetchUrl('https://chess-api.com/v1')).toBe(true);
  });

  test.each([
    '/api/users/me',
    'http://chess-api.com/v1',
    'https://chess-api.com.evil.example/v1',
    'https://evil.example/?https://chess-api.com',
    'http://192.168.1.1/',
    'not a url'
  ])('refuses %s', (url) => {
    expect(isAllowedTunnelFetchUrl(url)).toBe(false);
  });
});

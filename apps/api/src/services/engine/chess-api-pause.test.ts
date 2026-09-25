import { describe, expect, it } from 'vitest';
import { chessApiPausedUntil } from './chess-api-pause.js';

const MINUTE = 60 * 1000;

describe('chessApiPausedUntil', () => {
  const limitedAt = new Date('2026-01-01T00:00:00Z');

  it('is null when never rate-limited', () => {
    expect(chessApiPausedUntil(null)).toBeNull();
  });

  it('pauses for 30 minutes after the rate limit', () => {
    expect(chessApiPausedUntil(limitedAt, new Date(limitedAt.getTime() + 10 * MINUTE))?.toISOString()).toBe(
      '2026-01-01T00:30:00.000Z'
    );
  });

  it('is null once the cooldown has passed', () => {
    expect(chessApiPausedUntil(limitedAt, new Date(limitedAt.getTime() + 30 * MINUTE))).toBeNull();
  });
});

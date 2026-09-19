import { describe, expect, it } from 'vitest';
import { rebaseDates } from './rebaseDates.js';

const DAY = 86_400_000;
const recordedAt = '2026-09-19T18:00:00.000Z';

describe('rebaseDates', () => {
  it('moves every timestamp forward by the whole days since the recording', () => {
    const now = new Date(Date.parse(recordedAt) + 30 * DAY + 5 * 3_600_000);
    const out = rebaseDates({ playedAt: '2026-09-17T00:00:00.000Z', nested: [{ at: '2026-09-19T12:30:00.000Z' }] }, recordedAt, now);
    expect(out).toEqual({ playedAt: '2026-10-17T00:00:00.000Z', nested: [{ at: '2026-10-19T12:30:00.000Z' }] });
  });

  it('shifts date-only strings by the same whole days, so weekly buckets stay aligned', () => {
    const now = new Date(Date.parse(recordedAt) + 10 * DAY);
    expect(rebaseDates({ weekStart: '2026-09-14' }, recordedAt, now)).toEqual({ weekStart: '2026-09-24' });
  });

  it('leaves everything else alone', () => {
    const now = new Date(Date.parse(recordedAt) + 10 * DAY);
    const value = { pgn: '[Date "2026.09.10"]\n1. e4 e5', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', n: 3, ok: true, none: null };
    expect(rebaseDates(value, recordedAt, now)).toEqual(value);
  });

  it('does nothing when less than a day has passed', () => {
    const value = { at: '2026-09-19T12:00:00.000Z' };
    expect(rebaseDates(value, recordedAt, new Date(Date.parse(recordedAt) + 3_600_000))).toEqual(value);
  });
});

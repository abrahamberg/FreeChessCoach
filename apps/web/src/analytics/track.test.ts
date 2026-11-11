import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { funnelSource, trackFunnelEvent } from './track.js';
import { captureUtm, getVisitUtm } from './utm.js';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    length: 0
  };
}

describe('utm capture', () => {
  it('keeps the first page tags and ignores later pages', () => {
    const storage = memoryStorage();
    captureUtm('?utm_source=youtube&utm_medium=video&utm_campaign=week1&x=1', storage);
    captureUtm('?utm_source=other', storage);
    expect(getVisitUtm(storage)).toEqual({ utm_source: 'youtube', utm_medium: 'video', utm_campaign: 'week1' });
  });

  it('a first page without tags stores an empty set', () => {
    const storage = memoryStorage();
    captureUtm('', storage);
    captureUtm('?utm_source=late', storage);
    expect(getVisitUtm(storage)).toEqual({});
  });
});

describe('trackFunnelEvent', () => {
  const gtag = vi.fn();
  beforeEach(() => {
    gtag.mockReset();
  });
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'gtag');
  });

  it('does nothing without gtag', () => {
    expect(() => trackFunnelEvent('review_started', { source: 'pgn', signedIn: false })).not.toThrow();
  });

  it('sends source and signed_in', () => {
    Object.assign(globalThis, { gtag });
    trackFunnelEvent('game_imported', { source: 'chesscom', signedIn: true });
    expect(gtag).toHaveBeenCalledWith('event', 'game_imported', expect.objectContaining({ source: 'chesscom', signed_in: true }));
  });

  it('maps paste and file to pgn', () => {
    expect(funnelSource('paste')).toBe('pgn');
    expect(funnelSource('file')).toBe('pgn');
    expect(funnelSource('lichess')).toBe('lichess');
  });
});

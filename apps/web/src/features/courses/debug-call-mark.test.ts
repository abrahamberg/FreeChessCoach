import type { CourseDebugCall } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { callTitle, verdict } from './debug-call-mark.js';

const call = (extra: Partial<CourseDebugCall>): CourseDebugCall => ({ step: 'episode', episodeId: 'e3', repair: false, problems: [], error: null, snapshot: null, ...extra }) as CourseDebugCall;

describe('the call strip', () => {
  test('a call is named by its step, and by its episode and repair', () => {
    expect(callTitle(call({ step: 'outline' }))).toBe('outline');
    expect(callTitle(call({ repair: true }))).toBe('episode e3, repair');
  });

  test('the mark says failed, pending, passed, or how many checks found something', () => {
    expect(verdict(call({ error: 'boom' })).tone).toBe('bad');
    expect(verdict(call({ problems: null })).tone).toBe('pending');
    expect(verdict(call({ problems: [] })).tone).toBe('ok');
    expect(verdict(call({ problems: ['a', 'b'] }))).toEqual({ text: '✗2', tone: 'bad' });
  });
});

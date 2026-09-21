import type { EngineMode } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { describe, expect, test, vi } from 'vitest';
import type { Database } from '../db/schema.js';
import { streamActiveAnalyses } from './analyses.js';

const profile = vi.hoisted(() => ({ engineMode: 'native' as EngineMode }));

vi.mock('../db/repositories/analyses.js', () => ({
  findActiveForUser: vi.fn(async () => [])
}));

vi.mock('../db/repositories/users.js', () => ({
  findById: vi.fn(async () => ({ engineMode: profile.engineMode }))
}));

interface CapturedFrame {
  engineMode: EngineMode;
  analyses: unknown[];
}

interface CapturedStream {
  frames: CapturedFrame[];
  write(chunk: string): void;
  on(event: 'close', listener: () => void): void;
  close(): void;
}

function captureStream(): CapturedStream {
  const frames: CapturedFrame[] = [];
  let closeListener: (() => void) | null = null;
  return {
    frames,
    write(chunk) {
      frames.push(JSON.parse(chunk.replace(/^data: /, '')) as CapturedFrame);
    },
    on(_event, listener) {
      closeListener = listener;
    },
    close() {
      closeListener?.();
    }
  };
}

const fakeDb = {} as Kysely<Database>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('streamActiveAnalyses', () => {
  test('re-reads engineMode every tick, so a settings change reaches an already-open stream', async () => {
    const stream = captureStream();
    const finished = streamActiveAnalyses(fakeDb, 'user-1', profile.engineMode, stream, 5);

    try {
      await sleep(60);
      expect(stream.frames[0]?.engineMode).toBe('native');

      // PATCH /api/users/me while the stream is open — the next poll tick
      // must observe it (this is the topbar pill's only engineMode source).
      profile.engineMode = 'browser';
      await sleep(60);
      expect(stream.frames.at(-1)?.engineMode).toBe('browser');
    } finally {
      stream.close();
      await finished;
    }
  });
});

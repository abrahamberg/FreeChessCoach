import { describe, expect, it } from 'vitest';
import { BotThinkingLogSchema } from './bot-thinking.js';

const step = { id: 1, label: 'Opening book lookup', startedAt: 1000, endedAt: 1004, status: 'done' as const };

describe('BotThinkingLogSchema', () => {
  it('accepts a finished move and a still-running move in the same log', () => {
    const log = {
      moves: [
        {
          ply: 4,
          source: 'turn',
          status: 'done',
          startedAt: 1000,
          endedAt: 2500,
          path: 'top moves — best move',
          picked: 'Nf6',
          engineMode: 'internal',
          steps: [step]
        },
        {
          ply: 6,
          source: 'failover',
          status: 'thinking',
          startedAt: 5000,
          endedAt: null,
          path: null,
          picked: null,
          engineMode: null,
          steps: [{ ...step, id: 2, endedAt: null, status: 'running' }]
        }
      ]
    };
    expect(BotThinkingLogSchema.parse(log)).toEqual(log);
  });

  it('accepts an empty log', () => {
    expect(BotThinkingLogSchema.parse({ moves: [] })).toEqual({ moves: [] });
  });

  it('rejects an unknown step status', () => {
    const bad = { moves: [{ ply: 1, source: 'turn', status: 'thinking', startedAt: 0, endedAt: null, path: null, picked: null, engineMode: null, steps: [{ ...step, status: 'stuck' }] }] };
    expect(BotThinkingLogSchema.safeParse(bad).success).toBe(false);
  });
});

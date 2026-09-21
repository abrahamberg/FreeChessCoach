import { describe, expect, it } from 'vitest';
import { CommitBotMoveResponseSchema } from './session.js';

const MOVE = { fen: 'f', san: 'e4', ply: 1, quality: 'best', elapsedMs: 1200 };
const BASE = { gameOver: null, whiteRemainingMs: null, blackRemainingMs: null };

describe('CommitBotMoveResponseSchema', () => {
  it('accepts a move that could not be rated in time (quality null) for either side', () => {
    const response = { ...BASE, player: { ...MOVE, quality: null }, bot: { ...MOVE, san: 'e5', ply: 2, quality: null } };
    expect(CommitBotMoveResponseSchema.parse(response)).toEqual(response);
  });

  it('still accepts rated moves', () => {
    const response = { ...BASE, player: MOVE, bot: { ...MOVE, san: 'e5', ply: 2 } };
    expect(CommitBotMoveResponseSchema.parse(response)).toEqual(response);
  });

  it('still rejects a quality that is not a known tier', () => {
    expect(CommitBotMoveResponseSchema.safeParse({ ...BASE, player: { ...MOVE, quality: 'amazing' }, bot: null }).success).toBe(false);
  });
});

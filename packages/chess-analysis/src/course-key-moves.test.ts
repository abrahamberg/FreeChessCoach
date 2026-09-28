import { describe, expect, test } from 'vitest';
import { episodeKeyMoves } from './course-key-moves.js';
import type { TrapSkeleton } from './course-skeleton.js';

const trap: TrapSkeleton = { kind: 'trap', lineId: 'l1', baitNodeId: 'n11', answerNodeId: 'n12', punishNodeIds: ['n13', 'n14', 'n15', 'n16'], safeMoveSan: 'Nc3', trapperRiskNodeIds: [] };
const sans = new Map([
  ['n13', 'Qd2'],
  ['n14', 'Bxc3'],
  ['n15', 'Qxc3'],
  ['n16', 'Qc1#']
]);

describe('episodeKeyMoves', () => {
  test('a trap: its bait, answer and last move, in the episode that holds them', () => {
    expect(episodeKeyMoves({ role: 'punish', path: ['n13', 'n14', 'n15', 'n16'], answerNodeId: null, sans, skeleton: trap })).toEqual(['n16']);
    expect(episodeKeyMoves({ role: 'bait', path: ['n11'], answerNodeId: null, sans, skeleton: trap })).toEqual(['n11']);
    expect(episodeKeyMoves({ role: 'quiz', path: ['n12'], answerNodeId: 'n12', sans, skeleton: trap })).toEqual(['n12']);
  });

  test('a hook or a safety episode has none; any kind keeps its quiz answer and mates', () => {
    expect(episodeKeyMoves({ role: 'safety', path: ['n11'], answerNodeId: null, sans, skeleton: trap })).toEqual([]);
    expect(episodeKeyMoves({ role: 'hook', path: ['n1'], answerNodeId: null, sans, skeleton: trap })).toEqual([]);
    expect(episodeKeyMoves({ role: 'example', path: ['n13', 'n14', 'n15', 'n16'], answerNodeId: 'n14', sans, skeleton: null })).toEqual(['n14', 'n16']);
  });
});

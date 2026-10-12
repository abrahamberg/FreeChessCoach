import { describe, expect, test } from 'vitest';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { nodeIdOfPly, plyOfNodeId, qualitiesByNodeId } from './line-tree.js';

describe('line-tree', () => {
  test('a ply and its node id map to each other; ply 0 is the start', () => {
    expect(nodeIdOfPly(0)).toBeNull();
    expect(nodeIdOfPly(3)).toBe('n3');
    expect(plyOfNodeId(null)).toBe(0);
    expect(plyOfNodeId('n3')).toBe(3);
  });

  test('qualities are keyed by the node id of their ply', () => {
    const move = { ply: 2, quality: 'best' } as ClassifiedMoveDto;

    expect(qualitiesByNodeId([move])).toEqual({ n2: move });
  });
});

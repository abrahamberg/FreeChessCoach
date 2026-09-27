import { describe, expect, test } from 'vitest';
import { CourseDocumentSchema, type CourseDocument } from './course.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function minimalDocument(): CourseDocument {
  return {
    version: 1,
    kind: 'trap',
    title: 'The Englund Gambit trap',
    promise: 'After this you can spring the trap and avoid it.',
    learnerSide: 'black',
    levelBand: 'improving',
    coachPersona: 'general',
    startFen: START,
    nodes: [
      {
        id: 'n1',
        parentId: null,
        san: 'd4',
        uci: 'd2d4',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
        lineId: 'l1',
        comment: null,
        arrows: [{ from: 'd2', to: 'd4', kind: 'best' }]
      }
    ],
    lines: [{ id: 'l1', name: 'Line A', leafNodeId: 'n1' }],
    chapters: [{ id: 'c1', title: 'The trap', lineId: 'l1', episodeIds: ['e1'] }],
    episodes: [
      {
        id: 'e1',
        role: 'setup',
        focus: 'White grabs the centre.',
        startNodeId: 'n1',
        endNodeId: 'n1',
        beats: [{ nodeId: null, say: 'Watch this.', caption: 'Watch', arrows: [] }],
        notes: [{ nodeId: 'n1', text: 'The main move.', arrows: [] }],
        drillNodeIds: []
      }
    ],
    takeaways: [],
    hookOptions: [],
    clipLinks: {}
  };
}

describe('CourseDocumentSchema', () => {
  test('accepts a minimal draft', () => {
    expect(CourseDocumentSchema.parse(minimalDocument())).toEqual(minimalDocument());
  });

  test('rejects a node id that is not n<number>', () => {
    const document = minimalDocument();
    const [node] = document.nodes;
    if (node) node.id = 'x1';
    expect(CourseDocumentSchema.safeParse(document).success).toBe(false);
  });

  test('rejects an arrow off the board', () => {
    const document = minimalDocument();
    document.nodes[0]?.arrows.push({ from: 'i9', to: 'a1', kind: 'idea' });
    expect(CourseDocumentSchema.safeParse(document).success).toBe(false);
  });

  test('rejects more than three takeaways', () => {
    const document = { ...minimalDocument(), takeaways: ['a', 'b', 'c', 'd'] };
    expect(CourseDocumentSchema.safeParse(document).success).toBe(false);
  });

  test('rejects an unknown kind', () => {
    expect(CourseDocumentSchema.safeParse({ ...minimalDocument(), kind: 'endgame' }).success).toBe(false);
  });
});

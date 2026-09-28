import { describe, expect, test } from 'vitest';
import { bandForRating, clipCaption, clipLine, CourseDocumentSchema, levelCode, type CourseDocument } from './course.js';

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
        opener: { say: 'Watch this.', caption: 'Watch' },
        plies: [{ nodeId: 'n1', text: 'The main move.', arrows: [], long: true, short: false }],
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

describe('the clip line, caption and level', () => {
  const ply = { nodeId: 'n1', text: 'The knight lands on f7. It forks queen and rook, and White is lost.', arrows: [], long: true, short: true };

  test('the clip says its own line when it has one, else the course text', () => {
    expect(clipLine(ply)).toBe(ply.text);
    expect(clipLine({ ...ply, clipText: 'Fork!' })).toBe('Fork!');
    expect(clipLine({ ...ply, clipText: '  ' })).toBe(ply.text);
  });

  test('the caption is set, or the line’s first sentence cut at a word', () => {
    expect(clipCaption(ply)).toBe('The knight lands on f7.');
    expect(clipCaption({ ...ply, caption: 'Nf7!' })).toBe('Nf7!');
    expect(clipCaption({ ...ply, text: 'A very long first sentence that keeps going well past what fits on the screen at once' }, 30)).toBe('A very long first sentence…');
  });

  test('a level reads 1200-01 and gives the prompts their band', () => {
    expect(levelCode({ rating: 1200, order: 1 })).toBe('1200-01');
    expect([800, 1200, 1600, 2000].map(bandForRating)).toEqual(['novice', 'improving', 'club', 'advanced']);
  });
});

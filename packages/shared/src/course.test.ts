import { describe, expect, test } from 'vitest';
import { bandForRating, CourseDocumentSchema, levelCode, type CourseDocument } from './course.js';
import { AskCourseCoachRequestSchema } from './course-api.js';

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
        arrows: [{ from: 'd2', to: 'd4', kind: 'best' }],
        marks: [],
        glyph: null
      }
    ],
    lines: [{ id: 'l1', name: 'Line A', note: null, leafNodeId: 'n1' }],
    chapters: [{ id: 'c1', title: 'The trap', lineId: 'l1', episodeIds: ['e1'] }],
    episodes: [
      {
        id: 'e1',
        role: 'setup',
        focus: 'White grabs the centre.',
        startNodeId: 'n1',
        endNodeId: 'n1',
        plies: [{ nodeId: 'n1', text: 'The main move.', arrows: [], course: true }],
        drillNodeIds: []
      }
    ],
    takeaways: [],
    diagnosisCodes: [],
    clipLinks: {}
  };
}

describe('CourseDocumentSchema', () => {
  test('accepts a minimal draft', () => {
    expect(CourseDocumentSchema.parse(minimalDocument())).toEqual(minimalDocument());
  });

  test('a node keeps its marks and glyph, and refuses ones the creator cannot write', () => {
    const document = minimalDocument();
    const [node] = document.nodes;
    if (node) Object.assign(node, { marks: ['key', 'quiz'], glyph: '??' });
    expect(CourseDocumentSchema.parse(document).nodes[0]).toMatchObject({ marks: ['key', 'quiz'], glyph: '??' });
    if (node) Object.assign(node, { marks: ['loud'] });
    expect(CourseDocumentSchema.safeParse(document).success).toBe(false);
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
    expect(CourseDocumentSchema.safeParse({ ...minimalDocument(), kind: 'novel' }).success).toBe(false);
  });
});

describe('levels', () => {
  test('a level reads 1200-01 and gives its band', () => {
    expect(levelCode({ rating: 1200, order: 1 })).toBe('1200-01');
    expect([800, 1200, 1600, 2000].map(bandForRating)).toEqual(['novice', 'improving', 'club', 'advanced']);
  });
});

describe('AskCourseCoachRequestSchema', () => {
  const request = (messages: { role: 'user' | 'assistant'; content: string }[]) => ({ slug: 'englund', episodeId: 'e1', nodeId: 'n3', messages });

  test("the coach's long answer goes back as history; the learner's question keeps the box's limit", () => {
    const longAnswer = 'Nc6 attacks e5 again. '.repeat(120);
    expect(AskCourseCoachRequestSchema.safeParse(request([{ role: 'user', content: 'Why?' }, { role: 'assistant', content: longAnswer }, { role: 'user', content: 'And then?' }])).success).toBe(true);
    expect(AskCourseCoachRequestSchema.safeParse(request([{ role: 'user', content: 'x'.repeat(2001) }])).success).toBe(false);
  });
});

describe('a course for beginners', () => {
  test('takes a rating from 100 in the document, a series and tags', () => {
    const document = { ...minimalDocument(), level: { rating: 100, order: 1 }, series: { name: 'Chess From Zero', position: 7, total: 14 }, tags: ['hangs-piece', 'no-scan-before-move'] };
    expect(CourseDocumentSchema.safeParse(document).success).toBe(true);
    expect(CourseDocumentSchema.safeParse({ ...document, level: { rating: 99, order: 1 } }).success).toBe(false);
  });

  test('refuses a lesson past the series total and a tag that is not a slug', () => {
    expect(CourseDocumentSchema.safeParse({ ...minimalDocument(), series: { name: 'S', position: 15, total: 14 } }).success).toBe(false);
    expect(CourseDocumentSchema.safeParse({ ...minimalDocument(), tags: ['Hangs Piece'] }).success).toBe(false);
    expect(CourseDocumentSchema.safeParse({ ...minimalDocument(), tags: ['a', 'a'] }).success).toBe(false);
  });
});

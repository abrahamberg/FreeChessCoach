import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { bandForRating, videoCaption, videoLine, CourseDocumentSchema, CourseOutlineCallSchema, CourseOutlineSchema, EpisodeScriptSchema, levelCode, ReelScriptSchema, type CourseDocument } from './course.js';
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
        plies: [{ nodeId: 'n1', text: 'The main move.', arrows: [], course: true, video: false }],
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
    expect(CourseDocumentSchema.safeParse({ ...minimalDocument(), kind: 'novel' }).success).toBe(false);
  });
});

describe('the video line, caption and level', () => {
  const ply = { nodeId: 'n1', text: 'The knight lands on f7. It forks queen and rook, and White is lost.', arrows: [], course: true, video: true };

  test('the video says its own line when it has one, else the course text', () => {
    expect(videoLine(ply)).toBe(ply.text);
    expect(videoLine({ ...ply, say: 'Fork!' })).toBe('Fork!');
    expect(videoLine({ ...ply, say: '  ' })).toBe(ply.text);
  });

  test('the caption is set, or the line’s first sentence cut at a word', () => {
    expect(videoCaption(ply)).toBe('The knight lands on f7.');
    expect(videoCaption({ ...ply, caption: 'Nf7!' })).toBe('Nf7!');
    expect(videoCaption({ ...ply, text: 'A very long first sentence that keeps going well past what fits on the screen at once' }, 30)).toBe('A very long first sentence…');
  });

  test('a level reads 1200-01 and gives the prompts their band', () => {
    expect(levelCode({ rating: 1200, order: 1 })).toBe('1200-01');
    expect([800, 1200, 1600, 2000].map(bandForRating)).toEqual(['novice', 'improving', 'club', 'advanced']);
  });
});

describe('model-facing schemas are strict (every key required)', () => {
  /** Every object's keys, as a strict provider reads the schema: each must
   * be required. The first OpenAI run refused the outline for keyNodeIds. */
  function optionalKeys(node: unknown, path = ''): string[] {
    if (!node || typeof node !== 'object') return [];
    const schema = node as { properties?: Record<string, unknown>; required?: string[] };
    const own = schema.properties ? Object.keys(schema.properties).filter((key) => !schema.required?.includes(key)).map((key) => `${path}.${key}`) : [];
    return [...own, ...Object.entries(node).flatMap(([key, child]) => optionalKeys(child, `${path}/${key}`))];
  }
  // As the request is sent: a defaulted key is optional there too (the
  // second OpenAI run refused the outline's defaulted "video").
  const strict = (schema: z.ZodType): string[] => optionalKeys(z.toJSONSchema(schema, { io: 'input' }));

  test('the outline, episode and reel calls', () => {
    expect(strict(CourseOutlineCallSchema)).toEqual([]);
    expect(strict(EpisodeScriptSchema)).toEqual([]);
    expect(strict(ReelScriptSchema)).toEqual([]);
    // The stored outline keeps code's key moves, so it is not sent to a model.
    expect(strict(CourseOutlineSchema).some((key) => key.endsWith('.keyNodeIds'))).toBe(true);
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

import type { CourseDocument, CourseReel } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { analyseEnglund } from './course-test-fixtures.js';
import { overusedOpeners, reelSeconds, sentenceOpeners, verifyCourseFrame, verifyCourseReel } from './course-verify-reel.js';

function reel(edit: Partial<CourseReel> = {}): CourseReel {
  return {
    style: 'highlight',
    startNodeId: 'n10',
    climaxNodeId: 'n16',
    endNodeId: 'n16',
    hook: 'The Englund Gambit trap that mates in eight.',
    topText: 'Black to play',
    beats: [
      { nodeId: 'n12', say: 'Bb4 pins the bishop to the king.', caption: 'The pin' },
      { nodeId: 'n16', say: 'Qc1 is mate. The king has nowhere to go.', caption: 'Mate' }
    ],
    payoff: 'Mate in eight',
    cta: 'Follow for a trap a day.',
    loop: 'And it all starts with one greedy gambit.',
    ...edit
  };
}

function verify(value: CourseReel, hasVideo = true) {
  const { tree, dossier } = analyseEnglund();
  return verifyCourseReel({ reel: value, startFen: tree.startFen, nodes: tree.nodes, dossier, hasVideo });
}

const codes = (problems: { code: string }[]) => problems.map((problem) => problem.code);

describe('verifyCourseReel (§13.9)', () => {
  test('a sound reel passes; it runs within 45 s', () => {
    expect(verify(reel())).toEqual([]);
    expect(reelSeconds(reel(), 7)).toBeLessThan(45);
  });

  test('lines stay in the span; the moves they name are in the analysis', () => {
    expect(verify(reel({ beats: [{ nodeId: 'n4', say: 'Nc6 develops.', caption: 'Develop' }] }))).toContainEqual({ code: 'reel', nodeId: 'n4', message: "The reel line on n4 is outside the reel's moves" });
    expect(codes(verify(reel({ loop: 'Nd5 was the real test.' })))).toContain('moves');
  });

  test('a short spoken hook, short bands, a specific call to action, no intro', () => {
    expect(verify(reel({ hook: 'Hey guys, today we look at a trap in the Englund Gambit for you' })).map((problem) => problem.message)).toEqual([
      "The reel's hook has 14 words (at most 10)",
      `"hey guys" in the reel's hook: start on the idea, not an intro`,
      `"today we" in the reel's hook: start on the idea, not an intro`
    ]);
    expect(verify(reel({ topText: 'Can you find what Black plays here?' }))[0]?.message).toBe("The reel's top text has 7 words (at most 5)");
    expect(verify(reel({ cta: 'Like and subscribe!' }))[0]?.message).toBe('"like and subscribe" is a generic call to action: say what the viewer gets');
  });

  test('a promo needs a video; a reel too long is cut', () => {
    expect(verify(reel({ style: 'promo' }), false)[0]?.message).toBe('A promo reel sends viewers to the YouTube video, and this course has none');
    const long = Array.from({ length: 6 }, (_, index) => ({ nodeId: 'n12', say: `Line ${index} goes on and on and on with far too many words for one reel.`, caption: 'Long' }));
    expect(verify(reel({ beats: long, style: 'puzzle' })).map((problem) => problem.message)).toContainEqual(expect.stringMatching(/^The reel runs about \d+ s \(at most 45\): cut words$/));
  });
});

describe('the promo and the openers', () => {
  test('the side to play is the side that plays the climax', () => {
    expect(verify(reel({ topText: 'White to play: mate?' })).map((problem) => problem.message)).toEqual(["the reel's top text says \"white to play\", but black plays the climax"]);
    expect(verify(reel({ topText: 'Black to play' }))).toEqual([]);
  });

  test('a promo stops before its climax: a line on it or after it never plays', () => {
    const promo = reel({ style: 'promo', climaxNodeId: 'n16', endNodeId: 'n16' });
    expect(verify(promo).map((problem) => problem.message)).toEqual(['The promo stops before n16, so the line on n16 never plays: keep lines before the climax']);
  });

  test('words earlier lines lean on, everyday and board words aside', () => {
    const lines = ['Execute the pin.', "It's over. Execute.", "White's queen is lost. It's mate.", 'Secure the win.'];
    expect(sentenceOpeners(lines)).toEqual(new Map([['execute', 2], ['secure', 1]]));
    expect(overusedOpeners(lines)).toEqual(['execute']);
  });
});

describe('verifyCourseFrame (§13.9)', () => {
  const base = (): CourseDocument => {
    const { tree } = analyseEnglund();
    return {
      version: 1, kind: 'trap', title: 't', promise: '', learnerSide: 'black', levelBand: 'novice', coachPersona: 'commander', startFen: tree.startFen,
      nodes: tree.nodes, lines: tree.lines, chapters: [], takeaways: [], hookOptions: [], clipLinks: {},
      episodes: [
        { id: 'e1', role: 'setup', focus: '', startNodeId: 'n1', endNodeId: 'n10', drillNodeIds: [], plies: ['n2', 'n4', 'n6'].map((nodeId) => ({ nodeId, text: `Execute the plan on ${nodeId}.`, arrows: [], course: true, video: false })) },
        { id: 'e2', role: 'bait', focus: '', startNodeId: 'n11', endNodeId: 'n11', drillNodeIds: [], plies: [{ nodeId: 'n11', text: 'Execute the plan on n2.', arrows: [], course: true, video: false }] }
      ],
      video: { title: 'How a greedy queen gets mated in eight moves, the whole story', thumbnailText: 'Mated in eight moves', hook: 'Welcome back! A trap.', outro: 'That was the trap.' }
    };
  };

  test("the video's packaging, and the coach's voice across the course", () => {
    expect(verifyCourseFrame(base()).map((problem) => problem.message)).toEqual([
      'The video title has 61 characters (at most 55)',
      `"welcome back" in the video's hook: start on the idea, not an intro`,
      "The video's outro asks the viewer nothing: end on a question for the comments",
      '3 lines in e1 start with "execute": vary how the coach starts',
      '"Execute the plan on n2." is said in e1 and again in e2',
      '4 lines start a sentence with "execute" across the course: a catchphrase, vary it'
    ]);
  });

  test('a length a word or two over is not a problem; well over is', () => {
    const hook = (count: number): CourseDocument => {
      const document = base();
      return { ...document, episodes: [], video: { title: 't', thumbnailText: 't', hook: Array(count).fill('word').join(' '), outro: 'Would you fall for it?' } };
    };
    expect(verifyCourseFrame(hook(41))).toEqual([]);
    expect(verifyCourseFrame(hook(45)).map((problem) => problem.message)).toEqual(["The video's hook has 45 words (at most 40): the first 15 seconds"]);
  });
});

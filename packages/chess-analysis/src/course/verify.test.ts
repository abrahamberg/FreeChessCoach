import { describe, expect, test } from 'vitest';
import type { CourseEpisode, CoursePly } from '@freechesscoach/shared';
import { analyseEnglund } from './test-fixtures.js';
import { verifyCourseEpisode, type CourseVerifyInput } from './verify.js';

/** docs/courses.md §6.6's worked example, as one move for both versions. */
function worked(): CourseEpisode {
  return {
    id: 'e3',
    role: 'bait',
    focus: '',
    startNodeId: 'n11',
    endNodeId: 'n11',
    plies: [
      {
        nodeId: 'n11',
        text: "Bc3 attacks the queen, so it feels like the natural move. But the bishop now stands on the diagonal to White's king, with nothing else in between.",
        say: 'Six. Bc3. It hits the queen, and the queen has to run. Any sane player grabs that tempo, and so would you: a free move with a threat in it. Nobody looks behind the bishop.',
        caption: 'Hits the queen',
        arrows: [{ from: 'c3', to: 'b2', kind: 'threat' }],
        course: true,
        video: true
      }
    ],
    quiz: {
      answerNodeId: 'n12',
      scene: 'White has grabbed a pawn with the queen and Black has a lead in development.',
      prompt: 'Black to move. Find the strongest move.',
      hint: 'The bishop on c3 has the white king right behind it.',
      reveal: "Bb4 pins the bishop to the king. It can't move, and Black is ready to take it."
    },
    drillNodeIds: []
  };
}


function verify(edit: (episode: CourseEpisode) => void, extra: Partial<CourseVerifyInput> = {}) {
  const { tree, dossier } = analyseEnglund();
  const episode = worked();
  edit(episode);
  return verifyCourseEpisode({ episode, startFen: tree.startFen, nodes: tree.nodes, dossier, ...extra });
}

const codes = (problems: { code: string }[]) => problems.map((problem) => problem.code);
const first = (episode: CourseEpisode): CoursePly => episode.plies[0]!;

describe('verifyCourseEpisode', () => {
  test('the §6.6 worked example passes', () => {
    expect(verify(() => undefined)).toEqual([]);
  });

  test('rejects a move the analysis never mentions; the lesson moves and the engine best are fine', () => {
    expect(codes(verify((episode) => (first(episode).text = 'Nd5 was the real test here.')))).toEqual(['moves']);
    expect(verify((episode) => (first(episode).text = 'After 5...Qxb2, Nc3 holds. Qb6 is the quiet try.'))).toEqual([]);
  });

  test('rejects a piece that is not on its square', () => {
    const pieces = (text: string) => codes(verify((episode) => (first(episode).text = text)));
    expect(pieces('Bc3 attacks the queen on b2; the rook on a1 is still loose.')).toEqual([]);
    expect(pieces('Bc3 attacks the knight on b2.')).toEqual(['pieces']);
  });

  test("rejects a tactic word the facts don't support", () => {
    expect(codes(verify((episode) => (first(episode).text = 'Bc3 is a fork.')))).toEqual(['tactic-words']);
    expect(codes(verify((episode) => (first(episode).text = 'Bc3 skews the queen.')))).toEqual(['tactic-words']);
  });

  test("rejects an arrow that isn't a move", () => {
    expect(codes(verify((episode) => first(episode).arrows.push({ from: 'a1', to: 'h8', kind: 'idea' })))).toEqual(['arrows']);
  });

  test('rejects a line over its length', () => {
    expect(codes(verify((episode) => (first(episode).caption = 'This caption has far too many words')))).toEqual(['lengths']);
    const lengths = (budget: CourseVerifyInput['budget']) => verify(() => undefined, { budget }).map((problem) => [problem.code, problem.advisory ?? false]);
    expect(lengths({ wordsPerBeat: 10, wordsPerEpisode: 100 })).toEqual([['lengths', false]]);
    // The owner (2026-10-18): a video over its words guide is not cut by a repair.
    expect(lengths({ wordsPerBeat: 100, wordsPerEpisode: 10 })).toEqual([['lengths', true]]);
  });

  test('a quiz scene never names the answer', () => {
    expect(codes(verify((episode) => (episode.quiz!.scene = 'White just played Bc3; Bb4 is coming.')))).toContain('quiz');
  });

  test('a quiz prompt never names the answer', () => {
    expect(codes(verify((episode) => (episode.quiz!.prompt = 'Bb4 or Qxc3+: which one?')))).toContain('quiz');
  });
  // A from-scratch Stafford run (2026-10-12): 'play Be2. As Black, Ng4 is best… Best next is Qh4'.
  test('a video line names at most one move in notation', () => {
    expect(codes(verify((episode) => (first(episode).say = 'Bc3 hits the queen, but Bb4 pins it and Qd2 loses.')))).toContain('voice');
    expect(codes(verify((episode) => (first(episode).say = 'Bc3 hits the queen, but your bishop pins theirs.')))).not.toContain('voice');
    // The course note is read on the page, with the board beside it.
    expect(codes(verify((episode) => (first(episode).text = 'Bc3 hits the queen, but Bb4 pins it and Qd2 loses.')))).not.toContain('voice');
  });

  // The same run's reel, on 4…dxc6: "White took your pawn. Taking back opens your bishop."
  test('on a move that takes back, the piece said to be taken is the one that was', () => {
    const takeBack = (text: string) =>
      codes(
        verify((episode) => {
          Object.assign(episode, { role: 'punish', startNodeId: 'n15', endNodeId: 'n15', quiz: undefined });
          episode.plies = [{ nodeId: 'n15', text, arrows: [], course: true, video: false }];
        })
      );
    expect(takeBack('Black took your knight, so the queen takes back.')).toContain('pieces');
    expect(takeBack('Black took your bishop, so the queen takes back.')).not.toContain('pieces');
  });
  // A from-scratch Stafford run (2026-10-12): "Take the pawn; count king threats before folding", one move before the quiz.
  test("a bait line never plays the learner's answer, and its video line is long enough to tempt", () => {
    const long = 'It hits the queen, and the queen has to run. Any sane player grabs that tempo, and so would you: a free move with a threat in it.';
    expect(codes(verify((episode) => (first(episode).say = `Six. Bc3. ${long} Then Bb4 pins it.`)))).toContain('quiz');
    expect(codes(verify((episode) => (first(episode).say = 'Six. Bc3. It hits the queen.')))).toEqual(['lengths']);
  });
});

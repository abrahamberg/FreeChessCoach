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
        say: 'Six. Bc3. It hits the queen. Any sane player grabs that tempo.',
        caption: 'Hits the queen',
        arrows: [{ from: 'c3', to: 'b2', kind: 'threat' }],
        course: true,
        video: true
      }
    ],
    quiz: {
      answerNodeId: 'n12',
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
    expect(codes(verify((episode) => (first(episode).say = 'Six. Bc3 is a fork.')))).toEqual(['tactic-words']);
    expect(codes(verify((episode) => (first(episode).say = 'Six. Bc3 skews the queen.')))).toEqual(['tactic-words']);
  });

  test("rejects an arrow that isn't a move", () => {
    expect(codes(verify((episode) => first(episode).arrows.push({ from: 'a1', to: 'h8', kind: 'idea' })))).toEqual(['arrows']);
  });

  test('rejects a line over its length', () => {
    expect(codes(verify((episode) => (first(episode).caption = 'This caption has far too many words')))).toEqual(['lengths']);
    expect(codes(verify(() => undefined, { budget: { wordsPerBeat: 10, wordsPerEpisode: 100 } }))).toEqual(['lengths']);
  });

  test('a quiz prompt never names the answer', () => {
    expect(codes(verify((episode) => (episode.quiz!.prompt = 'Bb4 or Qxc3+: which one?')))).toContain('quiz');
  });
});

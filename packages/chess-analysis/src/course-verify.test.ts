import { describe, expect, test } from 'vitest';
import type { CourseEpisode } from '@freechesscoach/shared';
import { analyseEnglund } from './course-test-fixtures.js';
import { verifyCourseEpisode, type CourseVerifyInput } from './course-verify.js';

/** docs/courses.md §6.6, word for word. */
function worked(): CourseEpisode {
  return {
    id: 'e3',
    role: 'bait',
    focus: '',
    startNodeId: 'n11',
    endNodeId: 'n11',
    beats: [
      { nodeId: 'n11', say: 'Six. Bc3. It hits the queen. Any sane player grabs that tempo.', caption: 'Hits the queen', arrows: [{ from: 'c3', to: 'b2', kind: 'threat' }] },
      { nodeId: 'n11', say: 'Your move, Black. Look at the white king. Look at what stands in front of it.', caption: 'Your move', arrows: [], pauseMs: 3000 }
    ],
    notes: [
      {
        nodeId: 'n11',
        text: 'Bc3 attacks the queen, so it feels like the natural move. But the bishop now stands on the diagonal to White\'s king, with nothing else in between.',
        arrows: []
      }
    ],
    quiz: {
      answerNodeId: 'n12',
      prompt: 'Black to move. Find the strongest move.',
      hint: 'The bishop on c3 has the white king right behind it.',
      reveal: 'Bb4 pins the bishop to the king. It can\'t move, and Black is ready to take it.'
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

describe('verifyCourseEpisode', () => {
  test('the §6.6 worked example passes', () => {
    expect(verify(() => undefined)).toEqual([]);
  });

  test('nodes: a beat outside the episode, and beats out of order', () => {
    expect(verify((episode) => episode.beats.push({ nodeId: 'n14', say: 'Later.', caption: '', arrows: [] }))).toEqual([
      { code: 'nodes', nodeId: 'n14', message: 'Beat 3 is on n14, which is not in this episode' }
    ]);
    expect(codes(verify((episode) => episode.beats.unshift({ nodeId: 'n12', say: 'Bb4.', caption: '', arrows: [] })))).toEqual(['nodes', 'nodes']);
  });

  test('moves: a move the analysis never mentions', () => {
    expect(verify((episode) => (episode.notes[0]!.text = 'Nd5 was the real test here.'))).toEqual([
      { code: 'moves', nodeId: 'n11', message: 'Nd5 in the note on n11 is not in the analysis' }
    ]);
  });

  test('moves: lesson moves, the engine best and a listed alternative are fine', () => {
    expect(verify((episode) => (episode.notes[0]!.text = 'After 5...Qxb2, Nc3 holds. Qb6 is the quiet try.'))).toEqual([]);
  });

  test('tactic words: "fork" at n11, where the analysis finds none', () => {
    expect(verify((episode) => (episode.beats[0]!.say = 'Six. Bc3 is a fork.'))).toEqual([
      { code: 'tactic-words', nodeId: 'n11', message: '"fork" in beat 1: the analysis finds no fork here' }
    ]);
  });

  test("a hook may promise the line's ending; its notes still stay on its own moves", () => {
    const hook = (episode: CourseEpisode): void => {
      Object.assign(episode, { role: 'hook', startNodeId: 'n1', endNodeId: 'n1', quiz: undefined });
      episode.beats = [{ nodeId: null, say: 'Eight moves, then Qc1# checkmate.', caption: 'Checkmate in eight', arrows: [] }];
      episode.notes = [{ nodeId: 'n1', text: 'This line ends in mate with Qc1#.', arrows: [] }];
    };
    expect(verify(hook)).toEqual([]);
    expect(verify((episode) => (hook(episode), (episode.notes[0]!.nodeId = 'n16')))).toEqual([
      { code: 'nodes', nodeId: 'n16', message: 'A note is on n16, which is not in this episode' }
    ]);
    // Any other episode still may not claim the mate from move 1.
    expect(verify((episode) => (hook(episode), (episode.role = 'setup')))).not.toEqual([]);
  });

  test('an arrow along an attack passes after a check, when the other side cannot be to move', () => {
    const qb4 = (episode: CourseEpisode): void => {
      Object.assign(episode, { role: 'setup', startNodeId: 'n8', endNodeId: 'n8', quiz: undefined });
      episode.beats = [{ nodeId: 'n8', say: 'Qb4+ checks and hits b2.', caption: 'Check', arrows: [{ from: 'b4', to: 'f4', kind: 'threat' }, { from: 'b4', to: 'b2', kind: 'threat' }] }];
      episode.notes = [{ nodeId: 'n8', text: 'Qb4+ gives check.', arrows: [] }];
    };
    expect(verify(qb4)).toEqual([]);
    expect(verify((episode) => (qb4(episode), (episode.beats[0]!.arrows = [{ from: 'b4', to: 'h4', kind: 'threat' }])))).toEqual([
      { code: 'arrows', nodeId: 'n8', message: 'The arrow b4-h4 in beat 1 is not a move for either side' }
    ]);
  });

  test('tactic words: "skews" counts as a skewer claim', () => {
    expect(verify((episode) => (episode.beats[0]!.say = 'Six. Bc3 skews the queen.'))).toEqual([
      { code: 'tactic-words', nodeId: 'n11', message: '"skews" in beat 1: the analysis finds no skewer here' }
    ]);
  });

  test('numbers: eval numbers, and a percentage the direction did not give', () => {
    expect(verify((episode) => (episode.beats[0]!.say = 'Six. Bc3, and White is +1.3.'))).toEqual([
      { code: 'numbers', nodeId: 'n11', message: '"+1.3" in beat 1 looks like an engine number' }
    ]);
    expect(codes(verify((episode) => (episode.notes[0]!.text = 'The eval drops.')))).toEqual(['numbers']);
    expect(codes(verify((episode) => (episode.notes[0]!.text = '90% of players fall for it.')))).toEqual(['numbers']);
    expect(verify((episode) => (episode.notes[0]!.text = '90% of players fall for it.'), { direction: 'Say 90% fall for it.' })).toEqual([]);
  });

  test('arrows: not a move for either side, and at most 2 per beat', () => {
    expect(verify((episode) => episode.beats[1]!.arrows.push({ from: 'a1', to: 'h8', kind: 'idea' }))).toEqual([
      { code: 'arrows', nodeId: 'n11', message: 'The arrow a1-h8 in beat 2 is not a move for either side' }
    ]);
    const three = [{ from: 'c3', to: 'b2', kind: 'threat' as const }, { from: 'f8', to: 'b4', kind: 'best' as const }, { from: 'e1', to: 'e1', kind: 'idea' as const }];
    expect(codes(verify((episode) => (episode.beats[0]!.arrows = three)))).toEqual(['arrows']);
  });

  test('lengths: captions, notes and the word budget', () => {
    expect(codes(verify((episode) => (episode.beats[0]!.caption = 'This caption has far too many words')))).toEqual(['lengths']);
    expect(codes(verify((episode) => (episode.notes[0]!.text = 'One. Two. Three.')))).toEqual([]);
    expect(codes(verify((episode) => (episode.notes[0]!.nodeId = 'n11'), { budget: { wordsPerBeat: 10, wordsPerEpisode: 100 } }))).toEqual(['lengths', 'lengths']);
  });

  test('quiz: the hint must not give the answer away, the reveal must name it', () => {
    expect(verify((episode) => (episode.quiz!.hint = 'Think about Bb4.'))).toEqual([
      { code: 'quiz', nodeId: 'n12', message: 'The quiz hint names the answer 6…Bb4' }
    ]);
    expect(codes(verify((episode) => (episode.quiz!.reveal = 'The bishop pins it.')))).toEqual(['quiz']);
  });

  test('quiz: the answer has to be a clear only move', () => {
    expect(codes(verify((episode) => (episode.quiz = { answerNodeId: 'n11', prompt: 'White to move.', hint: 'The queen.', reveal: 'Bc3 hits it.' })))).toEqual(['quiz']);
  });

  test('phrases: stock chatbot phrases', () => {
    expect(verify((episode) => (episode.beats[1]!.say = "Let's dive in. Your move."))).toEqual([
      { code: 'phrases', nodeId: 'n11', message: '"let\'s dive in" in beat 2 is a stock phrase' }
    ]);
  });

  test('a hand-written episode with no analysis: legal moves pass, the rest is still checked', () => {
    const handWritten = (episode: CourseEpisode) => (episode.notes[0]!.text = 'Nc3 was safer. Qxa1 is there too.');
    expect(verify(handWritten, { dossier: null })).toEqual([]);
    expect(codes(verify((episode) => (episode.notes[0]!.text = 'Nd5 and +2.'), { dossier: null }))).toEqual(['moves', 'numbers']);
  });
});

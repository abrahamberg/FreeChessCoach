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

const ply = (nodeId: string, text: string, extra: Partial<CoursePly> = {}): CoursePly => ({ nodeId, text, arrows: [], course: true, video: false, ...extra });

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

  test('nodes: a move outside the episode, out of order, or twice', () => {
    expect(verify((episode) => episode.plies.push(ply('n14', 'Later.')))).toEqual([{ code: 'nodes', nodeId: 'n14', message: 'The line on n14 is on n14, which is not in this episode' }]);
    expect(verify((episode) => episode.plies.unshift(ply('n12', 'Bb4.')))).toEqual([{ code: 'nodes', nodeId: 'n11', message: 'The line on n11 goes back to an earlier move' }]);
    expect(codes(verify((episode) => episode.plies.push(ply('n11', 'Again.'))))).toEqual(['nodes']);
  });

  test('moves: a move the analysis never mentions', () => {
    expect(verify((episode) => (first(episode).text = 'Nd5 was the real test here.'))).toEqual([
      { code: 'moves', nodeId: 'n11', message: 'Nd5 in the line on n11 is not in the analysis' }
    ]);
  });

  test('moves: lesson moves, the engine best and a listed alternative are fine', () => {
    expect(verify((episode) => (first(episode).text = 'After 5...Qxb2, Nc3 holds. Qb6 is the quiet try.'))).toEqual([]);
  });

  test('tactic words: "fork" at n11, where the analysis finds none', () => {
    expect(verify((episode) => (first(episode).say = 'Six. Bc3 is a fork.'))).toEqual([
      { code: 'tactic-words', nodeId: 'n11', message: '"fork" in the video line on n11: the analysis finds no fork here' }
    ]);
  });

  test("a hook may promise the line's ending; its moves still stay its own", () => {
    const hook = (episode: CourseEpisode): void => {
      Object.assign(episode, { role: 'hook', startNodeId: 'n1', endNodeId: 'n1', quiz: undefined });
      episode.plies = [ply('n1', 'This line ends in mate with Qc1#.')];
    };
    expect(verify(hook)).toEqual([]);
    expect(verify((episode) => (hook(episode), (first(episode).nodeId = 'n16')))).toEqual([
      { code: 'nodes', nodeId: 'n16', message: 'The line on n16 is on n16, which is not in this episode' }
    ]);
    // Any other episode still may not claim the mate from move 1.
    expect(verify((episode) => (hook(episode), (episode.role = 'setup')))).not.toEqual([]);
  });

  test('an arrow along an attack passes after a check, when the other side cannot be to move', () => {
    const qb4 = (episode: CourseEpisode): void => {
      Object.assign(episode, { role: 'setup', startNodeId: 'n8', endNodeId: 'n8', quiz: undefined });
      episode.plies = [ply('n8', 'Qb4+ checks and hits b2.', { arrows: [{ from: 'b4', to: 'f4', kind: 'threat' }, { from: 'b4', to: 'b2', kind: 'threat' }] })];
    };
    expect(verify(qb4)).toEqual([]);
    expect(verify((episode) => (qb4(episode), (first(episode).arrows = [{ from: 'b4', to: 'h4', kind: 'threat' }])))).toEqual([
      { code: 'arrows', nodeId: 'n8', message: 'The arrow b4-h4 in the line on n8 is not a move for either side' }
    ]);
  });

  test('tactic words: a mated king is "trapped" where the facts say mate', () => {
    const mate = (episode: CourseEpisode): void => {
      Object.assign(episode, { role: 'punish', startNodeId: 'n16', endNodeId: 'n16', quiz: undefined });
      episode.plies = [ply('n16', 'Qc1#. The king is trapped.')];
    };
    expect(verify(mate)).toEqual([]);
    expect(codes(verify((episode) => (first(episode).say = 'Six. Bc3, and the queen is trapped.')))).toEqual(['tactic-words']);
  });

  test('tactic words: "skews" counts as a skewer claim', () => {
    expect(verify((episode) => (first(episode).say = 'Six. Bc3 skews the queen.'))).toEqual([
      { code: 'tactic-words', nodeId: 'n11', message: '"skews" in the video line on n11: the analysis finds no skewer here' }
    ]);
  });

  test('numbers: eval numbers, and a percentage the direction did not give', () => {
    expect(verify((episode) => (first(episode).say = 'Six. Bc3, and White is +1.3.'))).toEqual([
      { code: 'numbers', nodeId: 'n11', message: '"+1.3" in the video line on n11 looks like an engine number' }
    ]);
    expect(codes(verify((episode) => (first(episode).text = 'The eval drops.')))).toEqual(['numbers']);
    expect(codes(verify((episode) => (first(episode).text = '90% of players fall for it.')))).toEqual(['numbers']);
    expect(verify((episode) => (first(episode).text = '90% of players fall for it.'), { direction: 'Say 90% fall for it.' })).toEqual([]);
  });

  test('arrows: not a move for either side, and at most 2 per move', () => {
    expect(verify((episode) => first(episode).arrows.push({ from: 'a1', to: 'h8', kind: 'idea' }))).toEqual([
      { code: 'arrows', nodeId: 'n11', message: 'The arrow a1-h8 in the line on n11 is not a move for either side' }
    ]);
    const three = [{ from: 'c3', to: 'b2', kind: 'threat' as const }, { from: 'f8', to: 'b4', kind: 'best' as const }, { from: 'e1', to: 'e1', kind: 'idea' as const }];
    expect(codes(verify((episode) => (first(episode).arrows = three)))).toEqual(['arrows']);
  });

  test('lengths: captions, course lines and the video word budget', () => {
    expect(codes(verify((episode) => (first(episode).caption = 'This caption has far too many words')))).toEqual(['lengths']);
    // No caption: the video shows the first sentence, and the model is asked
    // for a caption, not told "the caption" it never wrote is long.
    expect(verify((episode) => ((first(episode).caption = undefined), (first(episode).say = 'White attacks the queen with the bishop now.')))).toEqual([
      { code: 'lengths', nodeId: 'n11', message: 'n11 has no caption, so the video shows its first sentence (8 words): add a caption of at most 6 words and keep the line' }
    ]);
    expect(codes(verify((episode) => (first(episode).text = 'One. Two. Three.')))).toEqual([]);
    // The video line is 12 words: over a 10-word budget per move.
    expect(verify(() => undefined, { budget: { wordsPerBeat: 10, wordsPerEpisode: 100 } })).toEqual([
      { code: 'lengths', nodeId: 'n11', message: 'The video line on n11 has 12 words (at most 10); give it a shorter video line' }
    ]);
    expect(codes(verify(() => undefined, { budget: { wordsPerBeat: 20, wordsPerEpisode: 5 } }))).toEqual(['lengths']);
  });

  test('lengths: a move that speaks with no words; one that does not speak may stay empty', () => {
    expect(verify((episode) => ((first(episode).text = ''), (first(episode).course = false), (first(episode).video = false)))).toEqual([]);
    expect(verify((episode) => ((first(episode).text = ''), (first(episode).say = undefined)))).toEqual([
      { code: 'lengths', nodeId: 'n11', message: 'n11 speaks but has no words; write them or untick it' }
    ]);
    expect(verify((episode) => ((first(episode).text = ''), (first(episode).course = false)))).toEqual([]);
  });

  test('lengths: the plan’s budget of speaking moves; a version it gave 0 was not planned', () => {
    const twoMoves = (episode: CourseEpisode): void => {
      episode.endNodeId = 'n12';
      episode.plies.push(ply('n12', 'Bb4 pins the bishop to the king.'));
    };
    expect(verify((episode) => (twoMoves(episode), (episode.budget = { course: 1, video: 1 })))).toEqual([
      { code: 'lengths', nodeId: null, message: '2 moves speak in the course (the plan allows 1)' }
    ]);
    expect(verify((episode) => (episode.budget = { course: 1, video: 1 }))).toEqual([]);
    // A course-only plan: the creator ticked a clip move by hand.
    expect(verify((episode) => (episode.budget = { course: 1, video: 0 }))).toEqual([]);
  });

  test('tempting moves: only the analysis’s at that move, and their why names only moves it knows', () => {
    expect(verify((episode) => (first(episode).tempting = [{ san: 'Qg4', why: 'It looks active but drops the queen.' }]))).toEqual([
      { code: 'tempting', nodeId: 'n11', message: "Qg4 on n11 is not one of the analysis's tempting moves there" }
    ]);
  });

  test("tempting moves: a why pasted from the analysis is not the coach's", () => {
    const problems = verify((episode) => (first(episode).tempting = [{ san: 'Qg4?', why: 'answered by Qxg4 (White is much better)' }]));
    expect(problems.map((problem) => problem.message)).toContain("why Qg4? fails on n11 copies the analysis: say in the coach's words what it hopes for and what goes wrong");
  });

  test('key moves speak in every version the plan made', () => {
    expect(verify((episode) => ((first(episode).video = false), (episode.budget = { course: 1, video: 1, keyNodeIds: ['n11'] })))).toEqual([
      { code: 'key-moves', nodeId: 'n11', message: '6.Bc3 is a key move of this episode; let it speak in the video' }
    ]);
    expect(verify((episode) => ((first(episode).video = false), (first(episode).course = false), (episode.budget = { course: 1, video: 1, keyNodeIds: ['n11'] })))).toEqual([
      { code: 'key-moves', nodeId: 'n11', message: '6.Bc3 is a key move of this episode; let it speak in the course and the video' }
    ]);
    // No clip planned: silent in the clip is fine.
    expect(verify((episode) => ((first(episode).video = false), (episode.budget = { course: 1, video: 0, keyNodeIds: ['n11'] })))).toEqual([]);
  });

  test('quiz: the hint must not give the answer away, the reveal must name it', () => {
    expect(verify((episode) => (episode.quiz!.hint = 'Think about Bb4.'))).toEqual([{ code: 'quiz', nodeId: 'n12', message: 'The quiz hint names the answer 6…Bb4' }]);
    expect(codes(verify((episode) => (episode.quiz!.reveal = 'The bishop pins it.')))).toEqual(['quiz']);
  });

  test('quiz: a reveal that only names the move', () => {
    expect(verify((episode) => (episode.quiz!.reveal = '6... Bb4'))).toEqual([
      { code: 'quiz', nodeId: 'n12', message: 'The quiz reveal only names 6…Bb4; say in one sentence why it works' }
    ]);
  });

  test('quiz: the answer has to be a clear only move', () => {
    expect(codes(verify((episode) => (episode.quiz = { answerNodeId: 'n11', prompt: 'White to move.', hint: 'The queen.', reveal: 'Bc3 hits the queen and gains a tempo.' })))).toEqual(['quiz']);
  });

  test('phrases: stock chatbot phrases', () => {
    expect(verify((episode) => (first(episode).say = "Let's dive in. Bc3 hits the queen."))).toEqual([
      { code: 'phrases', nodeId: 'n11', message: '"let\'s dive in" in the video line on n11 is a stock phrase' }
    ]);
  });

  test('phrases: "dossier" is the prompt\'s word, never the learner\'s', () => {
    expect(verify((episode) => (first(episode).text = 'Bc3 hits the queen, but the dossier prefers Nc3.'))).toContainEqual({
      code: 'phrases', nodeId: 'n11', message: 'the line on n11 says "dossier": the learner never sees it; say "the engine", or just name the better move'
    });
  });

  test('node ids: the coach names the move, never "n16"', () => {
    expect(verify((episode) => (first(episode).text = 'Bc3 hits the queen, and n16 is coming.'))).toEqual([
      { code: 'nodes', nodeId: 'n11', message: 'the line on n11 says "n16": name the move (8…Qc1#), never a node id' }
    ]);
  });

  test('a hand-written episode with no analysis: legal moves pass, the rest is still checked', () => {
    const handWritten = (episode: CourseEpisode) => (first(episode).text = 'Nc3 was safer. Qxa1 is there too.');
    expect(verify(handWritten, { dossier: null })).toEqual([]);
    expect(codes(verify((episode) => (first(episode).text = 'Nd5 and +2.'), { dossier: null }))).toEqual(['moves', 'numbers']);
  });
});

describe('pieces on squares (§7)', () => {
  const pieces = (problems: { code: string; message: string }[]) => problems.filter((problem) => problem.code === 'pieces').map((problem) => problem.message);

  test('a piece a line names stands on that square in a position the line is about', () => {
    expect(pieces(verify((episode) => (first(episode).text = 'Bc3 attacks the queen on b2; the rook on a1 is still loose.')))).toEqual([]);
    expect(pieces(verify((episode) => (first(episode).text = 'Bc3 attacks the knight on b2.')))).toEqual([
      '"knight on b2" in the line on n11: no knight stands on b2 in the positions this line is about'
    ]);
  });

  test("a safety line is about the board before the bait and the safe line; after the bait only where it names it", () => {
    const safety = (text: string) =>
      verify((episode) => {
        episode.role = 'safety';
        episode.quiz = undefined;
        episode.plies = [ply('n11', text, { playOut: ['Nc3', 'Bb4', 'Rb1'] })];
      });
    // The Elephant run: "6.e3 keeps the knight on d5 safe", with the knight on c3.
    expect(pieces(safety('Nc3 keeps the bishop on c3 safe.'))).toEqual(['"bishop on c3" in the line on n11: no bishop stands on c3 in the positions this line is about']);
    expect(pieces(safety('Nc3, not Bc3: the bishop on c3 would be pinned. The rook on b1 guards b2.'))).toEqual([]);
  });
});

describe('our words (§7)', () => {
  test('"listed", "the given line" and "the continuation" are ours, not the learner\'s', () => {
    const messages = verify((episode) => (first(episode).text = 'Bc3 attacks the queen; in the listed line White is fine.')).map((problem) => problem.message);
    expect(messages).toContain('the line on n11 says "listed": the learner never sees our list; name the moves or say what happens');
  });
});

describe('a puzzle solve (§13.2)', () => {
  const check = { san: 'Qxc3+', kind: 'check' as const, does: [], refutation: ['Nxc3'], after: [], captures: '', verdict: '', balance: '', notTheAnswer: null };
  const solve = (tempting: CoursePly['tempting']) => {
    const { tree, dossier } = analyseEnglund();
    const nodes = dossier.nodes.map((node) => (node.nodeId === 'n12' ? { ...node, tempting: [check] } : node));
    const episode: CourseEpisode = {
      id: 'e2', role: 'solve', focus: '', startNodeId: 'n12', endNodeId: 'n12', drillNodeIds: [],
      plies: [ply('n12', 'Checks first. Qxc3+ loses the queen to Nxc3. Captures next. Then Bb4. It pins the bishop.', { tempting })]
    };
    return verifyCourseEpisode({ episode, startFen: tree.startFen, nodes: tree.nodes, dossier: { ...dossier, nodes } }).map((problem) => problem.message);
  };

  test('every check the solver looks at is discussed; a solve line may run 5 sentences', () => {
    expect(solve(undefined)).toContain('At 6…Bb4 the solver looks at every check: add Qxc3+ to the tempting moves there, each with why it fails');
    expect(solve([{ san: 'Qxc3+', why: 'Nxc3 takes the queen.' }]).filter((message) => /every check|sentences/.test(message))).toEqual([]);
  });

  test('a quiz prompt never names the answer', () => {
    const messages = verify((episode) => {
      if (episode.quiz) episode.quiz.prompt = 'Bb4 or Qxc3+: which one?';
    }).map((problem) => problem.message);
    expect(messages).toContain('The quiz prompt names the answer 6…Bb4');
  });
});

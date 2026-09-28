import { Chess } from 'chess.js';
import { buildCourseSkeleton, parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseKind, CourseVideos, EngineEval } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { ENGLUND, englundDossier } from '../../../test/helpers/course-fixtures.js';
import { buildCourseDossierFromEngine, type CourseDossierBuilder } from '../course-dossier.js';
import { buildManualEpisodes } from './manual-episodes.js';
import { temptingNote } from './manual-notes.js';

/** Level everywhere: the engine's two lines are the first two legal moves. */
function levelEngine(fens: string[]): Promise<EngineEval[]> {
  return Promise.resolve(
    fens.map((fen, ply) => ({
      ply,
      fen,
      depth: 20,
      lines: new Chess(fen).moves({ verbose: true }).slice(0, 2).map((move) => ({ moveSan: move.san, moveUci: `${move.from}${move.to}`, cp: 0, mateIn: null }))
    }))
  );
}

async function manual(pgn: string, kind: CourseKind, learnerSide: 'white' | 'black', options: { engine?: CourseDossierBuilder; videos?: CourseVideos } = {}) {
  const tree = parseCourseTree(pgn);
  const document: CourseDocument = {
    version: 1, kind, title: 't', promise: '', learnerSide, levelBand: 'improving', coachPersona: 'general', startFen: tree.startFen,
    nodes: tree.nodes, lines: tree.lines, chapters: [], episodes: [], takeaways: [], hookOptions: [], clipLinks: {},
    ...(options.videos ? { videos: options.videos } : {})
  };
  const { dossier, lines } = options.engine ? await options.engine(tree, learnerSide, 'owner') : await buildCourseDossierFromEngine(tree, learnerSide, { analyzeGame: levelEngine });
  const lineGames = lines.map((analysis) => analysis.line);
  const skeleton = buildCourseSkeleton({ kind, tree, lines: lineGames, dossier });
  if (!skeleton) throw new Error('no skeleton');
  return buildManualEpisodes({ document, skeleton, dossier, lines: lineGames });
}

describe('buildManualEpisodes', () => {
  test('opening course: the idea, a chapter per sideline from where it branches, then recap', async () => {
    const { chapters, episodes } = await manual('{Main} 1. e4 c6 2. d4 d5 3. e5 ({Exchange} 3. exd5 cxd5 4. Bd3 Nc6 5. c3) 3... Bf5 *', 'opening', 'black');

    expect(chapters.map((chapter) => [chapter.title, chapter.lineId])).toEqual([
      ['The idea', 'l1'],
      ['Exchange', 'l2'],
      ['Recap', 'l1']
    ]);
    expect(episodes.map((episode) => episode.role)).toEqual(['line', 'deviation', 'recap']);
    const [line, deviation] = episodes;
    expect(line?.drillNodeIds).toEqual(['n2', 'n4', 'n6']);
    expect(deviation?.startNodeId).toBe('n7');
    expect(deviation?.drillNodeIds).toEqual(['n8', 'n10']);
    expect(line?.plies.map((ply) => ply.nodeId)).toEqual(['n2', 'n4', 'n6']);
    expect(line?.plies[0]?.text).toContain('Caro-Kann');
  });

  test('master game: intro and the moves; creator comments and arrows reach the notes', async () => {
    const { chapters, episodes } = await manual('1. e4 { [%cal Gd2d4] Centre first } e5 2. Nf3 Nc6 *', 'master_game', 'white');

    expect(chapters[0]?.title).toBe('The game');
    expect(episodes.map((episode) => episode.role)).toEqual(['intro', 'moves']);
    const first = episodes[1]?.plies[0];
    expect(first?.text).toMatch(/^Centre first/);
    expect(first?.arrows).toEqual([{ from: 'd2', to: 'd4', kind: 'best' }]);
  });

  test('a trap: the mate speaks in the course and the video; no video ticks without a video', async () => {
    const both = await manual(ENGLUND, 'trap', 'black', { engine: englundDossier });
    const punish = both.episodes.find((episode) => episode.role === 'punish');
    expect(punish?.budget?.keyNodeIds).toEqual(['n16']);
    expect(punish?.plies.find((ply) => ply.nodeId === 'n16')).toMatchObject({ course: true, video: true });

    const reelOnly = await manual(ENGLUND, 'trap', 'black', { engine: englundDossier, videos: { video: false, reel: true } });
    expect(reelOnly.episodes.flatMap((episode) => episode.plies).some((ply) => ply.video)).toBe(false);
    expect(reelOnly.episodes.flatMap((episode) => episode.plies).some((ply) => ply.course)).toBe(true);
  });

  test('puzzle: the question, a solve episode per learner move with its defence, then the recap', async () => {
    const { chapters, episodes } = await manual('[SetUp "1"]\n[FEN "r6k/6pp/7N/8/8/1Q6/6PP/6K1 w - - 0 1"]\n\n1. Qg8+ Rxg8 2. Nf7# *', 'puzzle', 'white');

    expect(chapters.map((chapter) => chapter.title)).toEqual(['The puzzle']);
    expect(episodes.map((episode) => episode.role)).toEqual(['question', 'solve', 'solve', 'recap']);
    expect(episodes[0]?.focus).toBe('question: mate in 2. What do you look at first?');
    expect(episodes[1]).toMatchObject({ startNodeId: 'n1', endNodeId: 'n2', drillNodeIds: ['n1'] });
    // Every solution move is asked, even where the test engine ranks no move clearly best.
    expect(episodes.map((episode) => episode.quiz?.answerNodeId ?? null)).toEqual([null, 'n1', 'n3', null]);
  });
});

describe('temptingNote (§13.5)', () => {
  test('the engine answer and what it does, for the creator to write over', () => {
    const facts = { san: 'Qxc3+', kind: 'capture' as const, refutation: ['Nxc3', 'Bb4'], after: ['moves the knight from b1 to c3', 'captures the queen on c3'], verdict: 'White is winning' };
    expect(temptingNote(facts)).toEqual({ san: 'Qxc3+', why: 'Nxc3 captures the queen on c3.', refutation: ['Nxc3', 'Bb4'] });
    expect(temptingNote({ ...facts, after: [...facts.after, 'attacks the bishop on f8'] }).why).toBe('Nxc3 captures the queen on c3 and attacks the bishop on f8.');
    expect(temptingNote({ ...facts, refutation: [] }).why).toBe('White is winning');
  });
});

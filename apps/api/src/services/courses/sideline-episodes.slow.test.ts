import { buildCourseSkeleton, checkCourseOutline, courseLineGames, parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseOutline, EngineEval } from '@freechesscoach/shared';
import { Chess } from 'chess.js';
import { beforeAll, describe, expect, test } from 'vitest';
import { buildCourseDossierFromEngine } from './dossier.js';
import { buildManualEpisodes } from './manual-episodes.js';

const NOAH =
  '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 d6 5. d4 b5 6. Bb3 Nxd4 7. Nxd4 exd4 8. Qxd4?? c5 9. Qd5 Be6 10. Qc6+ Bd7 11. Qd5 c4\n---\nDefending:\n# the victim sidesteps\n8. Bd5 Rb8 9. Bc6+ Bd7\n---\nToo early:\n9. - c4? 10. Qxa8';

function levelEngine(fens: string[]): Promise<EngineEval[]> {
  return Promise.resolve(
    fens.map((fen, ply) => ({ ply, fen, depth: 20, lines: new Chess(fen).moves({ verbose: true }).slice(0, 2).map((move) => ({ moveSan: move.san, moveUci: `${move.from}${move.to}`, cp: 0, mateIn: null })) }))
  );
}

/** One analysed course per PGN for the whole file: each build runs the
 * analysis steps on every line, and two of them in one test passed its 5 s. */
const plans = new Map<string, ReturnType<typeof buildPlan>>();
function plan(pgn: string): ReturnType<typeof buildPlan> {
  const built = plans.get(pgn) ?? buildPlan(pgn);
  plans.set(pgn, built);
  return built;
}

async function buildPlan(pgn: string) {
  const tree = parseCourseTree(pgn);
  const { dossier, lines } = await buildCourseDossierFromEngine(tree, 'black', { analyzeGame: levelEngine });
  const lineGames = lines.map((analysis) => analysis.line);
  const skeleton = buildCourseSkeleton({ kind: 'trap', tree, lines: lineGames, dossier });
  if (skeleton?.kind !== 'trap') throw new Error('no trap skeleton');
  const document = { version: 1, kind: 'trap', learnerSide: 'black', startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, videos: { video: true, reel: false } } as unknown as CourseDocument;
  return { tree, dossier, skeleton, manual: buildManualEpisodes({ document, skeleton, dossier, lines: courseLineGames(tree) }) };
}

describe('a trap with sidelines', () => {
  // The one build, with room: it runs the whole analysis on three lines.
  beforeAll(async () => void (await plan(NOAH)), 30_000);

  test('the bait is the victim’s ?? move; a defence at the bait replaces the safety episode, a trapper’s try is an alternative (lines come in pre-order)', async () => {
    const { skeleton, manual } = await plan(NOAH);

    expect(skeleton.baitNodeId).toBe('n15');
    expect(skeleton.sidelines.map((sideline) => [sideline.by, sideline.atBait])).toEqual([['trapper', false], ['victim', true]]);
    expect(manual.episodes.map((episode) => episode.role)).toEqual(['hook', 'setup', 'bait', 'quiz', 'punish', 'alternative', 'defence']);
    expect(manual.chapters.map((chapter) => chapter.title)).toEqual(['The trap', 'Too early', 'Defending']);
  });

  test('code’s plan passes the outline check, and without a defence at the bait the safety episode stays', async () => {
    const { tree, dossier, skeleton, manual } = await plan(NOAH);
    const outline: CourseOutline = {
      title: 't', promise: 'p', hookOptions: ['a', 'b', 'c'], takeaways: ['a', 'b', 'c'], video: null, reel: null,
      chapters: manual.chapters.map((chapter) => ({
        title: chapter.title,
        lineId: chapter.lineId,
        episodes: chapter.episodeIds.flatMap((id) => {
          const episode = manual.episodes.find((candidate) => candidate.id === id);
          return episode ? [{ id, role: episode.role, focus: episode.focus, startNodeId: episode.startNodeId, endNodeId: episode.endNodeId, narratedNodeIds: [], answerNodeId: null, budgetCourse: 0, budgetVideo: 0 }] : [];
        })
      }))
    };

    expect(checkCourseOutline({ kind: 'trap', outline, nodes: tree.nodes, lines: tree.lines, dossier, skeleton, maxNarrated: 99 })).toEqual([]);

    const plain = await plan('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 d6 5. d4 b5 6. Bb3 Nxd4 7. Nxd4 exd4 8. Qxd4?? c5 9. Qd5 Be6');
    expect(plain.manual.episodes.map((episode) => episode.role)).toContain('safety');
  });
});

describe('a master game with a variation', () => {
  const GAME = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 (4... d6 5. c3 Bd7) 5. O-O Be7 *';

  async function masterPlan() {
    const tree = parseCourseTree(GAME);
    const { dossier, lines } = await buildCourseDossierFromEngine(tree, 'white', { analyzeGame: levelEngine });
    const lineGames = lines.map((analysis) => analysis.line);
    const skeleton = buildCourseSkeleton({ kind: 'master_game', tree, lines: lineGames, dossier });
    if (skeleton?.kind !== 'master_game') throw new Error('no skeleton');
    const document = { version: 1, kind: 'master_game', learnerSide: 'white', startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, videos: { video: true, reel: false } } as unknown as CourseDocument;
    return { tree, dossier, skeleton, manual: buildManualEpisodes({ document, skeleton, dossier, lines: courseLineGames(tree) }) };
  }

  test('code’s plan covers every move: the variation has an episode of its own, and the outline check passes', async () => {
    const { tree, dossier, skeleton, manual } = await masterPlan();
    const outline: CourseOutline = {
      title: 't', promise: 'p', hookOptions: ['a', 'b', 'c'], takeaways: ['a', 'b', 'c'], video: null, reel: null,
      chapters: manual.chapters.map((chapter) => ({
        title: chapter.title,
        lineId: chapter.lineId,
        episodes: chapter.episodeIds.flatMap((id) => {
          const episode = manual.episodes.find((candidate) => candidate.id === id);
          return episode ? [{ id, role: episode.role, focus: episode.focus, startNodeId: episode.startNodeId, endNodeId: episode.endNodeId, narratedNodeIds: [], answerNodeId: null, budgetCourse: 0, budgetVideo: 0 }] : [];
        })
      }))
    };

    expect(manual.episodes.map((episode) => episode.role)).toEqual(['intro', 'moves', 'variation']);
    expect(checkCourseOutline({ kind: 'master_game', outline, nodes: tree.nodes, lines: tree.lines, dossier, skeleton, maxNarrated: 99 })).toEqual([]);
  });

  test('the skeleton’s critical moments and quizzes come from the main line only', async () => {
    const { tree, skeleton } = await masterPlan();
    const sideline = new Set(tree.nodes.filter((node) => node.lineId !== 'l1').map((node) => node.id));

    expect([...skeleton.criticalNodeIds, ...skeleton.quizNodeIds, ...skeleton.phaseBoundaryNodeIds].some((id) => sideline.has(id))).toBe(false);
  });
});

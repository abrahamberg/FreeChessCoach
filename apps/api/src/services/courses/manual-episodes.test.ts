import { Chess } from 'chess.js';
import { buildCourseSkeleton, parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseKind, EngineEval } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildCourseDossierFromEngine } from '../course-dossier.js';
import { buildManualEpisodes } from './manual-episodes.js';

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

async function manual(pgn: string, kind: CourseKind, learnerSide: 'white' | 'black') {
  const tree = parseCourseTree(pgn);
  const document: CourseDocument = {
    version: 1, kind, title: 't', promise: '', learnerSide, levelBand: 'improving', coachPersona: 'general', startFen: tree.startFen,
    nodes: tree.nodes, lines: tree.lines, chapters: [], episodes: [], takeaways: [], hookOptions: [], clipLinks: {}
  };
  const { dossier, lines } = await buildCourseDossierFromEngine(tree, learnerSide, { analyzeGame: levelEngine });
  const lineGames = lines.map((analysis) => analysis.line);
  const skeleton = buildCourseSkeleton({ kind, tree, lines: lineGames, dossier });
  if (!skeleton) throw new Error('no skeleton');
  return buildManualEpisodes({ document, skeleton, dossier, lines: lineGames });
}

describe('buildManualEpisodes', () => {
  test('opening course: the idea, a chapter per sideline from where it branches, then recap', async () => {
    const { chapters, episodes } = await manual('{Main} 1. e4 c6 2. d4 d5 3. e5 ({Exchange} 3. exd5 cxd5 4. Bd3 Nc6 5. c3) 3... Bf5 *', 'opening_course', 'black');

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
});

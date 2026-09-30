import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { episodeWalk, isAcceptedAlternative, stepView, withoutMove } from './course-steps.js';

const tree = parseCourseTree('1. d4 {[%cal Gd2d4]} e5 2. dxe5 Nc6 3. Nf3 Qe7 *');
const ids = tree.nodes.map((node) => node.id);

function documentWith(episode: CourseEpisode): CourseDocument {
  return {
    version: 1, kind: 'trap', title: 'T', promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'commander',
    startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], episodes: [episode], takeaways: [], hookOptions: [], clipLinks: {}
  };
}

const episode: CourseEpisode = {
  id: 'e1', role: 'bait', focus: '', startNodeId: ids[1]!, endNodeId: ids[5]!, drillNodeIds: [],
  plies: [{ nodeId: ids[2]!, text: 'Take the pawn.', arrows: [{ from: 'e5', to: 'e5', kind: 'idea' }], course: true, video: false }],
  quiz: { answerNodeId: ids[5]!, prompt: 'What now?', hint: 'The queen.', reveal: 'Qe7 sets the trap.' }
};

describe('episodeWalk', () => {
  test('starts before the first move and finds the quiz answer', () => {
    const walk = episodeWalk(documentWith(episode), episode);
    expect(walk.startFen).toBe(tree.nodes[0]!.fenAfter);
    expect(walk.moves.map((node) => node.san)).toEqual(['e5', 'dxe5', 'Nc6', 'Nf3', 'Qe7']);
    expect(walk.quizAt).toBe(4);
    expect(episodeWalk(documentWith({ ...episode, quiz: undefined }), { ...episode, quiz: undefined }).quizAt).toBeNull();
  });

  test('a step shows the move just played, its note and arrows, else the PGN arrows', () => {
    const walk = episodeWalk(documentWith(episode), episode);
    expect(stepView(episode, walk, 0)).toEqual({ fen: walk.startFen, move: null, note: null, arrows: [] });
    expect(stepView(episode, walk, 2)).toMatchObject({ note: 'Take the pawn.', arrows: [{ from: 'e5', to: 'e5', kind: 'idea' }] });
    expect(stepView(episode, walk, 1)).toMatchObject({ note: null, arrows: [] });
  });
});

test('only moves about as good as the course move are accepted', () => {
  expect(['brilliant', 'great', 'best', 'excellent'].every((quality) => isAcceptedAlternative(quality as never))).toBe(true);
  expect(['good', 'inaccuracy', 'mistake', 'blunder', 'miss'].some((quality) => isAcceptedAlternative(quality as never))).toBe(false);
});

test('a hidden move’s name is blanked out of its note, and only that move', () => {
  expect(withoutMove('Nc6 hits the pawn on e5.', 'Nc6')).toBe('… hits the pawn on e5.');
  expect(withoutMove('After 2...Nc6 the pawn is attacked; Nc6 again.', 'Nc6')).toBe('After … the pawn is attacked; … again.');
  expect(withoutMove('Qxe5 would drop the queen; e5 is the move.', 'e5')).toBe('Qxe5 would drop the queen; … is the move.');
  expect(withoutMove('Mate with Qc1#!', 'Qc1#')).toBe('Mate with …');
  expect(withoutMove('Develop the knight.', null)).toBe('Develop the knight.');
});

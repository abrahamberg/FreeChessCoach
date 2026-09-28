import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { courseMoveList, courseMoveSounds } from './course-move-list.js';

const tree = parseCourseTree('1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 *');
const [d4, e5, dxe5, nc6] = tree.nodes;

function documentFrom(startFen = tree.startFen): CourseDocument {
  return {
    version: 1, kind: 'trap', title: 'T', promise: '', learnerSide: 'black', levelBand: 'improving', coachPersona: 'commander',
    startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], episodes: [], takeaways: [], hookOptions: [], clipLinks: {}
  };
}

describe('courseMoveList', () => {
  test('an episode’s moves come after its lead-in, numbered from the course start', () => {
    const list = courseMoveList(documentFrom(), [dxe5!, nc6!], { [e5!.id]: { cp: 110, quality: 'book' }, [dxe5!.id]: { cp: 120, quality: 'best' }, [nc6!.id]: { cp: 90, quality: 'good' } });
    expect(list.leadIn).toBe(2);
    expect(list.sanMoves).toEqual(['d4', 'e5', 'dxe5', 'Nc6']);
    expect(list.start).toEqual({ moveNumber: 1, blackFirst: false });
    expect(list.positions[0]).toEqual({ ply: 0, fen: tree.startFen });
    expect(list.positions[4]).toEqual({ ply: 4, fen: nc6!.fenAfter });
    // d4 has no evaluation, so it has no row; the others feed the eval bar and graph.
    expect(list.classifiedMoves.map((move) => [move.ply, move.moveSan, move.mover, move.isUserMove, move.evalAfterCp, move.quality])).toEqual([
      [2, 'e5', 'black', true, 110, 'book'],
      [3, 'dxe5', 'white', false, 120, 'best'],
      [4, 'Nc6', 'black', true, 90, 'good']
    ]);
  });

  test('a course with no engine pass has no rated moves', () => {
    expect(courseMoveList(documentFrom(), [d4!], {}).classifiedMoves).toEqual([]);
  });
});

describe('courseMoveSounds', () => {
  test('an analyzed course move: either side’s blunder is bad, a solved quiz is great', () => {
    const evals = { [d4!.id]: { cp: 20, quality: 'book' as const }, [e5!.id]: { cp: 110, quality: 'blunder' as const } };
    // The learner plays Black: White's d4 is the opponent's knock.
    expect(courseMoveSounds(documentFrom(), evals, d4!)).toEqual({ base: 'opponent', stinger: null });
    expect(courseMoveSounds(documentFrom(), evals, e5!)).toEqual({ base: 'move', stinger: 'bad' });
    expect(courseMoveSounds(documentFrom(), evals, nc6!, 'great')).toEqual({ base: 'move', stinger: 'great' });
    // No engine pass: just the move's own sound (dxe5 is a capture).
    expect(courseMoveSounds(documentFrom(), {}, dxe5!)).toEqual({ base: 'capture', stinger: null });
  });
});

import type { CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { noEvaluationNodeIds } from './dossier.js';
import { courseFenBefore } from './moves.js';
import { buildCourseDrill, courseDrillKey } from './review-schedule.js';
import { parseCourseTree } from './tree.js';

const ROOK = '4k3/8/8/8/8/8/8/R3K3 w - - 0 1';
const KNIGHT = '7k/8/8/8/8/8/8/K2N4 w - - 0 1';
const PAWN = '4k3/4p3/8/8/8/8/8/4K3 b - - 0 1';
const THREE = `[FEN "${ROOK}"]\n\n1. Ra8+ Kd7 *\n\n[FEN "${KNIGHT}"]\n\n1. Nc3 Kg7 *\n\n[FEN "${PAWN}"]\n\n1... e5 *`;

describe('a PGN of several games', () => {
  test('is one example per game, each from its own [FEN], when every game is read', () => {
    const tree = parseCourseTree(THREE, { allGames: true });

    expect(tree.errors).toEqual([]);
    expect(tree.nodes.map((node) => `${node.id}:${node.san}`)).toEqual(['n1:Ra8+', 'n2:Kd7', 'n3:Nc3', 'n4:Kg7', 'n5:e5']);
    expect(tree.nodes.filter((node) => node.parentId === null).map((node) => node.startFen)).toEqual([ROOK, KNIGHT, PAWN]);
    expect(tree.lines.map((line) => line.leafNodeId)).toEqual(['n2', 'n4', 'n5']);
    expect(tree.startFen).toBe(ROOK);
  });

  test('is its first game alone by default, and past six games an error', () => {
    expect(parseCourseTree(THREE).nodes.map((node) => node.san)).toEqual(['Ra8+', 'Kd7']);
    expect(parseCourseTree(THREE).nodes.every((node) => node.startFen === undefined)).toBe(true);
    const seven = Array.from({ length: 7 }, () => `[FEN "${ROOK}"]\n\n1. Ra8+ *`).join('\n\n');
    expect(parseCourseTree(seven, { allGames: true }).errors[0]?.message).toContain('at most 6');
  });

  test('keeps PGN line numbers across games, for an illegal move in the second', () => {
    const tree = parseCourseTree(`[FEN "${ROOK}"]\n\n1. Ra8+ *\n\n[FEN "${KNIGHT}"]\n\n1. Nc4 *`, { allGames: true });
    expect(tree.errors[0]?.pgnLine).toBe(7);
  });

  test('keeps every example’s drill position and move, so progress keys are the FEN and the move', () => {
    const tree = parseCourseTree(THREE, { allGames: true });
    const byId = new Map(tree.nodes.map((node) => [node.id, node]));
    expect(courseFenBefore(byId, tree.startFen, byId.get('n3')!)).toBe(KNIGHT);
    const episode = (id: string, node: string): CourseEpisode => ({ id, role: 'example', focus: '', startNodeId: node, endNodeId: node, plies: [], drillNodeIds: [node] });
    const document: CourseDocument = {
      version: 1, kind: 'lesson', title: 'T', promise: '', learnerSide: 'white', levelBand: 'novice', coachPersona: 'general', startFen: tree.startFen,
      nodes: tree.nodes, lines: tree.lines, chapters: [], diagnosisCodes: [], episodes: [episode('e1', 'n1'), episode('e2', 'n3'), episode('e3', 'n5')], takeaways: [], hookOptions: [], clipLinks: {}
    };
    const asked = buildCourseDrill(document).episodes.map((each) => each.steps.find((step) => step.asked)?.key);
    expect(asked).toEqual([courseDrillKey(ROOK, 'a1a8'), courseDrillKey(KNIGHT, 'd1c3'), courseDrillKey(PAWN, 'e7e5')]);
  });
});

describe('noEvaluationNodeIds', () => {
  test('is the marked move and every move after it, not the moves before or beside it', () => {
    const tree = parseCourseTree('1. e4 e5 2. Nf3 @noeval Nc6 (2... d6) 3. Bb5 (3. Bc4) *');
    const names = new Map(tree.nodes.map((node) => [node.id, node.san]));
    expect([...noEvaluationNodeIds(tree)].map((id) => names.get(id)).sort()).toEqual(['Bb5', 'Bc4', 'Nc6', 'Nf3', 'd6']);
  });
});

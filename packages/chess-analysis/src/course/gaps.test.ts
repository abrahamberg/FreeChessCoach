import { expect, test } from 'vitest';
import { courseGaps } from './gaps.js';
import { analyseEnglund } from './test-fixtures.js';

test('gaps: the other ways out of the learner\'s check, and the engine\'s move where the opponent blunders', () => {
  const { tree, dossier } = analyseEnglund();
  const gaps = courseGaps(tree, dossier);
  // 4…Qb4+ (n8): the PGN answers 5.Bd2 only.
  const replies = gaps.filter((gap) => gap.reason === 'checkReply' && gap.afterNodeId === 'n8').map((gap) => gap.san);
  expect(replies).toEqual(expect.arrayContaining(['Nc3', 'c3', 'Qd2']));
  expect(replies).not.toContain('Bd2');
  // 6.Bc3 (n11) is the blunder; the engine's 6.Nc3 has no line.
  expect(gaps).toContainEqual(expect.objectContaining({ reason: 'engineBest', afterNodeId: 'n10', san: 'Nc3' }));
  // A reply the tree has is no gap: with every answer to the check as a line, none is left.
  const covered = new Set(replies);
  expect(courseGaps({ ...tree, nodes: [...tree.nodes, ...[...covered].map((san, index) => ({ ...tree.nodes[8]!, id: `n9${index}`, san }))] }, dossier).filter((gap) => gap.reason === 'checkReply' && gap.afterNodeId === 'n8')).toEqual([]);
});

import { parseCourseTree } from '@freechesscoach/chess-analysis';
import { describe, expect, test } from 'vitest';
import { intakeLineRows } from './intake-summary.js';

const TEXT = 'Main:\n1. e4 e5 2. Nf3 Nc6\n---\nLatvian:\n# wild\n2... f5\n---\nThe other:\n1... c5 2. Nf3 d6';

describe('intakeLineRows', () => {
  test('the rows add up to every move of the tree, once', () => {
    const tree = parseCourseTree(TEXT);

    expect(intakeLineRows(tree).reduce((sum, row) => sum + row.added, 0)).toBe(tree.nodes.length);
  });

  test('a row names its line, where it leaves the lines before it, and its note', () => {
    const rows = intakeLineRows(parseCourseTree(TEXT));

    expect(rows.map((row) => [row.name, row.from, row.added, row.note])).toEqual([
      ['Main', null, 4, null],
      ['Latvian', '2...f5', 1, 'wild'],
      ['The other', '1...c5', 3, null]
    ]);
  });
});

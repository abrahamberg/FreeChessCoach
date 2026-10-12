import { addMove, parsePgnTree, type PgnTree } from '@freechesscoach/chess-analysis';
import { describe, expect, test } from 'vitest';
import { explorerRows, type ExplorerRow, type VariationItem } from './explorer-rows.js';

function text(items: VariationItem[]): string {
  return items.map((item) => (item.type === 'open' ? '(' : item.type === 'close' ? ')' : `${item.number ? `${item.number} ` : ''}${item.san}`)).join(' ').replace(/\( /g, '(').replace(/ \)/g, ')');
}

function show(rows: ExplorerRow[]): string[] {
  return rows.map((row) => (row.kind === 'pair' ? `${row.moveNumber}. ${row.white?.san ?? '…'} ${row.black?.san ?? ''}`.trimEnd() : `  ${text(row.items)}`));
}

function nodeIds(rows: ExplorerRow[]): string[] {
  return rows.flatMap((row) => row.kind === 'pair'
    ? [row.white?.nodeId, row.black?.nodeId].filter((id): id is string => id !== undefined)
    : row.items.flatMap((item) => (item.type === 'move' ? [item.nodeId] : [])));
}

function expectEveryNodeOnce(tree: PgnTree): void {
  expect(nodeIds(explorerRows(tree)).sort()).toEqual(tree.nodes.map((node) => node.id).sort());
}

describe('explorerRows', () => {
  test('a one-line tree is the numbered pairs of a game', () => {
    const tree = parsePgnTree('1. e4 e5 2. Nf3 *');

    expect(show(explorerRows(tree))).toEqual(['1. e4 e5', '2. Nf3']);
    expectEveryNodeOnce(tree);
  });

  test('a line that starts on Black\'s move numbers from its FEN, Black first', () => {
    const tree = parsePgnTree('[FEN "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3"]\n\n3. Bb5 a6 4. Ba4 *');
    const black = parsePgnTree('[FEN "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 2"]\n\n2... Nf6 3. Bb5 *');

    expect(show(explorerRows(tree))).toEqual(['3. Bb5 a6', '4. Ba4']);
    expect(show(explorerRows(black))).toEqual(['2. … Nf6', '3. Bb5']);
  });

  test('a variation after Black\'s move is a block under its row', () => {
    const tree = parsePgnTree('1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 *');

    expect(show(explorerRows(tree))).toEqual(['1. e4 e5', '  1... c5 2. Nf3 d6', '2. Nf3']);
    expectEveryNodeOnce(tree);
  });

  test('a variation after White\'s move splits the row: Black continues with …', () => {
    const tree = parsePgnTree('1. e4 e5 2. Nf3 (2. Bc4 Nf6) 2... Nc6 *');

    expect(show(explorerRows(tree))).toEqual(['1. e4 e5', '2. Nf3', '  2. Bc4 Nf6', '2. … Nc6']);
    expectEveryNodeOnce(tree);
  });

  test('a variation\'s own variations are in brackets inside it, and Black is renumbered after one', () => {
    const tree = parsePgnTree('1. d4 e5 (1... d5 2. c4 e6 (2... c6 3. Nf3) 3. Nc3 Nf6) 2. dxe5 *');

    expect(show(explorerRows(tree))).toEqual([
      '1. d4 e5',
      '  1... d5 2. c4 e6 (2... c6 3. Nf3) 3. Nc3 Nf6',
      '2. dxe5'
    ]);
    expectEveryNodeOnce(tree);
  });

  test('several variations of one move are one block each, in order', () => {
    const tree = parsePgnTree('1. e4 (1. d4 d5) (1. c4) 1... e5 *');

    expect(show(explorerRows(tree))).toEqual(['1. e4', '  1. d4 d5', '  1. c4', '1. … e5']);
    expectEveryNodeOnce(tree);
  });

  test('a move explored from the game\'s last position is a variation after its rows, not a longer game', () => {
    const parsed = parsePgnTree('1. e4 e5 *');
    const made = addMove(parsed, 'n2', 'Nf3');
    if (!made.ok) throw new Error(made.error);

    expect(show(explorerRows(made.tree))).toEqual(['1. e4 e5', '  2. Nf3']);
    expectEveryNodeOnce(made.tree);
  });

  test('every node of a deeply nested tree appears once', () => {
    expectEveryNodeOnce(parsePgnTree('1. d4 e5 2. dxe5 (2. e4 exd4) 2... Nc6 3. Nf3 (3. f4 d6 (3... f6)) 3... Qe7 *'));
  });

  test('only a branch made in the explorer may be removed', () => {
    const parsed = parsePgnTree('1. e4 e5 (1... c5) 2. Nf3 *');
    const made = addMove(parsed, 'n1', 'e6');
    if (!made.ok) throw new Error(made.error);
    const variations = explorerRows(made.tree).filter((row) => row.kind === 'variation');

    expect(variations.map((row) => row.removable)).toEqual([false, true]);
  });
});

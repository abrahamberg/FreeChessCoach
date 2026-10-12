import { describe, expect, test } from 'vitest';
import { parsePgnTree } from './parse.js';

const NESTED = `[Event "Englund"]

1. d4 e5 2. dxe5 (2. e4 exd4) 2... Nc6 3. Nf3 (3. f4 d6 (3... f6)) 3... Qe7 *`;

function sans(pgn: string): string[] {
  return parsePgnTree(pgn).nodes.map((node) => node.san);
}

describe('parsePgnTree', () => {
  test('nested variations become a tree with ids n1… in pre-order, main line first', () => {
    const tree = parsePgnTree(NESTED);

    expect(tree.errors).toEqual([]);
    expect(tree.nodes.map((node) => `${node.id}:${node.san}`)).toEqual([
      'n1:d4', 'n2:e5', 'n3:dxe5', 'n4:Nc6', 'n5:Nf3', 'n6:Qe7',
      'n7:f4', 'n8:d6', 'n9:f6',
      'n10:e4', 'n11:exd4'
    ]);
    const byId = new Map(tree.nodes.map((node) => [node.id, node]));
    expect(byId.get('n1')?.parentId).toBeNull();
    expect(byId.get('n7')?.parentId).toBe('n4');
    expect(byId.get('n9')?.parentId).toBe('n7');
    expect(byId.get('n10')?.parentId).toBe('n2');
    expect(byId.get('n3')?.uci).toBe('d4e5');
  });

  test('a start position whose side not to move is in check is an error: the engine crashes on it', () => {
    const tree = parsePgnTree('[SetUp "1"]\n[FEN "8/8/1P6/4n3/2K5/8/8/7k b - - 0 1"]\n\n1... Nd7 *');
    expect(tree.errors[0]?.message).toContain('Invalid [FEN] header');
    expect(parsePgnTree('[SetUp "1"]\n[FEN "8/8/1P6/4n3/3K4/8/8/7k b - - 0 1"]\n\n1... Nd7 *').errors).toEqual([]);
  });

  test('a comment before the first move of a variation names the line that follows it', () => {
    const tree = parsePgnTree('{Main line} 1. e4 e5 ({The French} 1... e6 2. d4) 2. Nf3 *');

    expect(tree.nodes.filter((node) => node.branchName).map((node) => [node.san, node.branchName])).toEqual([
      ['e4', 'Main line'],
      ['e6', 'The French']
    ]);
    expect(tree.nodes.every((node) => node.comment === null)).toBe(true);
  });

  test('comments stay on their node', () => {
    const tree = parsePgnTree('1. e4 {Best by test} e5 (1... c5 {The Sicilian}) 2. Nf3 *');
    const bySan = new Map(tree.nodes.map((node) => [node.san, node]));

    expect(bySan.get('e4')?.comment).toBe('Best by test');
    expect(bySan.get('c5')?.comment).toBe('The Sicilian');
    expect(bySan.get('e5')?.comment).toBeNull();
  });

  test('[%cal] and [%csl] become creator arrows and leave the comment text', () => {
    const tree = parsePgnTree('1. e4 { [%cal Gd2d4,Rf8b4] Aim at d4 [%csl Ye5] } *');
    const [node] = tree.nodes;

    expect(node?.comment).toBe('Aim at d4');
    expect(node?.arrows).toEqual([
      { from: 'd2', to: 'd4', kind: 'best' },
      { from: 'f8', to: 'b4', kind: 'threat' },
      { from: 'e5', to: 'e5', kind: 'idea' }
    ]);
  });

  test('a [FEN] header sets the start', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4P3/8/8/PPP1PPPP/RNBQKBNR w KQkq - 1 3';
    const tree = parsePgnTree(`[SetUp "1"]\n[FEN "${fen}"]\n\n3. Nf3 Qe7 *`);

    expect(tree.startFen).toBe(fen);
    expect(tree.errors).toEqual([]);
    expect(tree.nodes.map((node) => node.san)).toEqual(['Nf3', 'Qe7']);
  });

  test('an illegal move reports its PGN line and move number, and the rest of that branch is skipped', () => {
    const tree = parsePgnTree('1. e4 e5\n2. Nf3 (2. Ke3 Nc6)\n2... Nc6 3. Bb5 Qxb5 4. a3 *');

    expect(tree.errors).toEqual([
      { san: 'Ke3', moveNumber: 2, side: 'white', pgnLine: 2, message: 'Illegal move 2. Ke3 (PGN line 2)' },
      { san: 'Qxb5', moveNumber: 3, side: 'black', pgnLine: 3, message: 'Illegal move 3... Qxb5 (PGN line 3)' }
    ]);
    expect(tree.nodes.map((node) => node.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
  });

  test('ids are stable when the same PGN is parsed twice', () => {
    expect(parsePgnTree(NESTED)).toEqual(parsePgnTree(NESTED));
  });

  test('move suffixes, NAGs, clock tags and the result are ignored', () => {
    expect(sans('1. e4! $1 { [%clk 0:05:00] } e5?! 2. Nf3!! Nc6?? 1-0')).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  test('only the first game of a multi-game PGN is read', () => {
    expect(sans('[Event "a"]\n\n1. e4 *\n\n[Event "b"]\n\n1. d4 *')).toEqual(['e4']);
  });

  test('a repeated variation reuses the existing node', () => {
    expect(sans('1. e4 (1. d4) (1. d4 d5) *')).toEqual(['e4', 'd4', 'd5']);
  });

  test('glyphs stay on their move, in a variation too', () => {
    const tree = parsePgnTree('1. e4 e5 2. Nf3 Nc6?! (2... d6 $1) 3. Bc4!! *');

    expect(tree.nodes.map((node) => `${node.san}${node.glyph ?? ''}`)).toEqual(['e4', 'e5', 'Nf3', 'Nc6?!', 'Bc4!!', 'd6!']);
  });
});

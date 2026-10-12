import { describe, expect, test } from 'vitest';
import { parsePgnTree } from './parse.js';
import { splitPgnSections } from './sections.js';

const MAIN = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 d6 5. d4 b5 6. Bb3 Nxd4 7. Nxd4 exd4 8. Qxd4 c5 9. Qd5 Be6';

function sans(pgn: string): string[] {
  return parsePgnTree(pgn).nodes.map((node) => node.san);
}

function parentSan(pgn: string, san: string): string | null {
  const tree = parsePgnTree(pgn);
  const node = tree.nodes.find((candidate) => candidate.san === san);
  return tree.nodes.find((candidate) => candidate.id === node?.parentId)?.san ?? null;
}

describe('splitPgnSections', () => {
  test('without a dash line the whole text is one section', () => {
    expect(splitPgnSections('1. e4 e5 *')).toHaveLength(1);
  });

  test('the head holds the title and the notes, and is blanked from the movetext', () => {
    const [section] = splitPgnSections('Defending:\n# a note\n\n1. e4 e5');

    expect(section).toMatchObject({ title: 'Defending', notes: ['a note'], firstLine: 1 });
    expect(section?.movetext).toBe('\n\n\n1. e4 e5');
  });

  test('each later section knows the line it starts on', () => {
    expect(splitPgnSections('1. e4\n---\n1... e5\n---\n2. Nf3').map((section) => section.firstLine)).toEqual([1, 3, 5]);
  });
});

describe('parsePgnTree sections', () => {
  test('a text with no dash line reads as before', () => {
    expect(sans('1. e4 e5 (1... c5) 2. Nf3 *')).toEqual(['e4', 'e5', 'Nf3', 'c5']);
  });

  test('a section starts before the White move its number names', () => {
    const pgn = `${MAIN}\n---\n8. Bd5 Rb8`;

    expect(parentSan(pgn, 'Bd5')).toBe('exd4');
    expect(parsePgnTree(pgn).errors).toEqual([]);
  });

  test.each(['9... c4', '9. - c4', '9. -- c4', '9. .. c4', '9. ... c4', '9. … c4'])('%s starts before Black\'s 9th move', (start) => {
    const pgn = `${MAIN}\n---\n${start}`;

    expect(parentSan(pgn, 'c4')).toBe('Qd5');
    expect(parsePgnTree(pgn).errors).toEqual([]);
  });

  test('a section one move past the main line continues it: no new line', () => {
    const tree = parsePgnTree(`1. e4 e5\n---\n2. Nf3 Nc6`);

    expect(tree.nodes.map((node) => `${node.id}:${node.san}:${node.parentId}`)).toEqual(['n1:e4:null', 'n2:e5:n1', 'n3:Nf3:n2', 'n4:Nc6:n3']);
  });

  test('moves a section repeats are not added twice', () => {
    expect(sans('1. e4 e5 2. Nf3\n---\n1. e4 e5 2. Nf3 Nc6')).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  test('a section follows the main line, not the last sideline', () => {
    const pgn = '1. e4 e5 2. Nf3 (2. f4 exf4) 2... Nc6\n---\n2... d6';

    expect(parentSan(pgn, 'd6')).toBe('Nf3');
  });

  test('a start position with Black to move counts plies from there', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const pgn = `[FEN "${fen}"]\n\n1... e5 2. Nf3\n---\n1... c5`;

    expect(parentSan(pgn, 'c5')).toBeNull();
    expect(parsePgnTree(pgn).errors).toEqual([]);
  });

  test('a mate marked with # keeps its #, and a # after a move is its comment', () => {
    const tree = parsePgnTree('1. f3 e5 2. g4 Qh4# # fool\'s mate');

    expect(tree.errors).toEqual([]);
    expect(tree.nodes.at(-1)).toMatchObject({ san: 'Qh4#', comment: "fool's mate" });
  });
});

describe('parsePgnTree section errors', () => {
  test('a later section with no move number is an error naming the section and its line', () => {
    const [error] = parsePgnTree(`${MAIN}\n---\nDefending:\nBd5 Rb8`).errors;

    expect(error?.message).toContain('Section "Defending" must start with a move number');
    expect(error?.pgnLine).toBe(4);
  });

  test('a move number the main line does not reach is an error', () => {
    const [error] = parsePgnTree(`1. e4 e5\n---\n9. Nf3`).errors;

    expect(error?.message).toContain('starts at 9., which the main line does not reach');
  });

  test('a dash anywhere but White\'s place at the start of a section is an error', () => {
    const [error] = parsePgnTree('1. e4 e5 2. - Nc6').errors;

    expect(error?.message).toContain('Unexpected "-"');
    expect(error?.pgnLine).toBe(1);
  });

  test('an illegal move in a section reports the text line it is on', () => {
    const [error] = parsePgnTree(`${MAIN}\n---\n8. Bd5 Rb8\n9. Ke3`).errors;

    expect(error?.pgnLine).toBe(4);
    expect(error?.message).toContain('Illegal move');
  });
});

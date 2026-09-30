/** Movetext tokens of one PGN game, with the PGN text line each starts on so
 * course-tree.ts can point a creator at an illegal move. */
export type CoursePgnToken =
  | { type: 'move'; san: string; pgnLine: number }
  | { type: 'comment'; text: string; pgnLine: number }
  | { type: 'open'; pgnLine: number }
  | { type: 'close'; pgnLine: number };

const MOVE_NUMBER = /^\d+\.*$/;
const IGNORED = /^(\.+|\$\d+|1-0|0-1|1\/2-1\/2|\*|[!?]+)$/;

/** Splits the movetext (headers removed) into moves, comments and variation
 * brackets. `;` line comments are treated like `{}` comments. */
export function tokenizeCoursePgn(movetext: string, firstLine: number): CoursePgnToken[] {
  const tokens: CoursePgnToken[] = [];
  let line = firstLine;
  let index = 0;
  while (index < movetext.length) {
    const character = movetext[index] ?? '';
    if (character === '\n') line += 1;
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    const startLine = line;
    if (character === '{' || character === ';') {
      const end = movetext.indexOf(character === '{' ? '}' : '\n', index + 1);
      const stop = end === -1 ? movetext.length : end;
      const text = movetext.slice(index + 1, stop);
      line += countNewlines(text);
      tokens.push({ type: 'comment', text, pgnLine: startLine });
      index = character === '{' ? stop + 1 : stop;
      continue;
    }
    if (character === '(' || character === ')') {
      tokens.push({ type: character === '(' ? 'open' : 'close', pgnLine: startLine });
      index += 1;
      continue;
    }
    const word = /^[^\s{}();]+/.exec(movetext.slice(index))?.[0] ?? character;
    index += word.length;
    pushWord(tokens, word, startLine);
  }
  return tokens;
}

/** `12.e4` and `12...Nf6` glue the number to the move; split them off. */
function pushWord(tokens: CoursePgnToken[], word: string, pgnLine: number): void {
  const glued = /^\d+\.+(.+)$/.exec(word);
  const move = glued?.[1] ?? word;
  if (MOVE_NUMBER.test(move) || IGNORED.test(move)) return;
  tokens.push({ type: 'move', san: move.replace(/[!?]+$/, ''), pgnLine });
}

function countNewlines(text: string): number {
  return text.split('\n').length - 1;
}

import { renderToStaticMarkup } from 'react-dom/server';
import { defaultPieces } from 'react-chessboard';

/** The app's board: react-chessboard's own squares, which CoachBoard leaves
 * as they are. Not `--board-light`/`--board-dark`: those colour the
 * evaluation bar and the logo tile, and on the board they read as another
 * site's green. */
export const BOARD_SQUARE_COLORS = { light: '#f0d9b5', dark: '#b58863' };
export const CANVAS_FONT = "'Inter Tight', Inter, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** A square's name → its top-left corner on the canvas. */
export type SquareOrigin = (name: string) => [number, number];

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src.slice(0, 40)}`));
    image.src = src;
  });
}

/** The board's own piece set (react-chessboard's SVGs) as images, by piece code ("wK"). */
export async function loadPieceImages(): Promise<Map<string, HTMLImageElement>> {
  const pieces = new Map<string, HTMLImageElement>();
  await Promise.all(
    Object.entries(defaultPieces).map(async ([code, render]) => {
      const markup = renderToStaticMarkup(render({ svgStyle: { width: 256, height: 256 } }));
      const svg = markup.includes('xmlns=') ? markup : markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      pieces.set(code, await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`));
    })
  );
  return pieces;
}

export function squareOrigin(x: number, y: number, square: number, orientation: 'white' | 'black'): SquareOrigin {
  const flipped = orientation === 'black';
  return (name) => {
    const file = name.charCodeAt(0) - 97;
    const rank = Number(name[1]) - 1;
    return [x + (flipped ? 7 - file : file) * square, y + (flipped ? rank : 7 - rank) * square];
  };
}

export function drawSquares(ctx: CanvasRenderingContext2D, at: SquareOrigin, square: number): void {
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      ctx.fillStyle = (rank + file) % 2 === 0 ? BOARD_SQUARE_COLORS.dark : BOARD_SQUARE_COLORS.light;
      const [sx, sy] = at(`${String.fromCharCode(97 + file)}${rank + 1}`);
      ctx.fillRect(sx, sy, square, square);
    }
  }
}

/** Square names as the app's board shows them: the ranks down the left-hand
 * file, the files along the bottom rank, each in the other square colour. */
export function drawCoordinates(ctx: CanvasRenderingContext2D, at: SquareOrigin, square: number, flipped: boolean): void {
  const pad = square * 0.06;
  ctx.save();
  ctx.font = `700 ${Math.round(square * 0.2)}px ${CANVAS_FONT}`;
  for (let index = 0; index < 8; index++) {
    const file = flipped ? 7 - index : index;
    const rank = flipped ? index : 7 - index;
    const left = String.fromCharCode(97 + (flipped ? 7 : 0));
    const bottomRank = flipped ? 8 : 1;
    const colorOf = (f: number, r: number): string => ((r + f) % 2 === 0 ? BOARD_SQUARE_COLORS.light : BOARD_SQUARE_COLORS.dark);
    const [rx, ry] = at(`${left}${rank + 1}`);
    ctx.fillStyle = colorOf(left.charCodeAt(0) - 97, rank);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(rank + 1), rx + pad, ry + pad);
    const [fx, fy] = at(`${String.fromCharCode(97 + file)}${bottomRank}`);
    ctx.fillStyle = colorOf(file, bottomRank - 1);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String.fromCharCode(97 + file), fx + square - pad, fy + square - pad);
  }
  ctx.restore();
}

export function drawPieces(ctx: CanvasRenderingContext2D, at: SquareOrigin, square: number, fen: string, pieces: Map<string, HTMLImageElement>): void {
  for (const [name, code] of piecesOf(fen)) {
    const image = pieces.get(code);
    const [sx, sy] = at(name);
    if (image) ctx.drawImage(image, sx, sy, square, square);
  }
}

/** Square name → react-chessboard piece code ("wK", "bP"), from a FEN. */
export function piecesOf(fen: string): [string, string][] {
  const placement = fen.split(' ')[0] ?? '';
  const pieces: [string, string][] = [];
  placement.split('/').forEach((row, index) => {
    let file = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char);
        continue;
      }
      const color = char === char.toUpperCase() ? 'w' : 'b';
      pieces.push([`${String.fromCharCode(97 + file)}${8 - index}`, `${color}${char.toUpperCase()}`]);
      file += 1;
    }
  });
  return pieces;
}

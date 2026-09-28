import type { CoachPersona, CourseArrow } from '@freechesscoach/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultPieces } from 'react-chessboard';
import { CLIP_SIZES, type ClipSegment, type ClipTimeline } from './timeline.js';

/** Fixed colours: a clip looks the same whatever theme the creator uses.
 * They are the app's light-theme tokens (styles/tokens.css). */
const COLORS = {
  background: '#141f19',
  panel: '#1d2b22',
  text: '#f7f8f5',
  muted: '#b9c2b5',
  accent: '#5b9c6a',
  light: '#ede2c8',
  dark: '#8ba173',
  lastMove: 'rgba(255, 214, 10, 0.38)',
  arrows: { idea: '#c9762a', threat: '#c0392b', best: '#5b9c6a' } satisfies Record<CourseArrow['kind'], string>
};
const FONT = "'Inter Tight', Inter, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** The coach sprite (public/brand/coaches.png, 4 × 2 portraits of 256 × 512)
 * cropped to a square around the face, as CoachAvatar.css does. */
const AVATAR_CELL: Record<CoachPersona, [column: number, row: number]> = {
  general: [0, 0],
  general_female: [1, 0],
  commander: [2, 0],
  scholar: [3, 0],
  huntress: [0, 1],
  shark: [1, 1],
  sunzi: [2, 1],
  gambler: [3, 1]
};
const AVATAR_TOP = [123, 538];

export interface ClipAssets {
  pieces: Map<string, HTMLImageElement>;
  avatar: HTMLImageElement | null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src.slice(0, 40)}`));
    image.src = src;
  });
}

/** The board's own piece set (react-chessboard's SVGs) as images, and the
 * coach portrait sheet. */
export async function loadClipAssets(): Promise<ClipAssets> {
  const pieces = new Map<string, HTMLImageElement>();
  await Promise.all(
    Object.entries(defaultPieces).map(async ([code, render]) => {
      const markup = renderToStaticMarkup(render({ svgStyle: { width: 256, height: 256 } }));
      const svg = markup.includes('xmlns=') ? markup : markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      pieces.set(code, await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`));
    })
  );
  const avatar = await loadImage('/brand/coaches.png').catch(() => null);
  return { pieces, avatar };
}

export interface FrameInput {
  timeline: ClipTimeline;
  segment: ClipSegment;
  /** Time into the clip, for the quiz countdown. */
  ms: number;
  title: string;
  persona: CoachPersona;
  coachName: string;
  orientation: 'white' | 'black';
  /** The course page's address, for the end card. */
  link: string;
  assets: ClipAssets;
}

/** Draws one frame at the timeline's size: the reel's bands, or the
 * YouTube video's board and side panel. */
export function drawClipFrame(ctx: CanvasRenderingContext2D, input: FrameInput): void {
  const { width, height } = CLIP_SIZES[input.timeline.format];
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);
  if (input.timeline.product === 'reel') drawReelFrame(ctx, input, width, height);
  else drawVideoFrame(ctx, input, width, height);
}

/** docs/courses.md §13.3: the top band holds the challenge from the first
 * frame; the board takes the full width; the bottom band holds the caption,
 * burned in; the coach small in a corner. No title card. */
function drawReelFrame(ctx: CanvasRenderingContext2D, input: FrameInput, width: number, height: number): void {
  const board = { x: 0, y: 420, size: 1080 };
  wrapText(ctx, input.timeline.topText ?? '', { x: width / 2, y: 190, maxWidth: 980, font: `900 96px ${FONT}`, color: COLORS.text, lineHeight: 110, maxLines: 2, align: 'center' });
  drawBoard(ctx, input, board.x, board.y, board.size);
  const { segment } = input;
  if (segment.moveLabel) text(ctx, segment.moveLabel, 40, 1580, `700 48px ${FONT}`, COLORS.accent);
  wrapText(ctx, segment.caption, { x: width / 2, y: 1690, maxWidth: 980, font: `900 80px ${FONT}`, color: COLORS.text, lineHeight: 92, maxLines: 2, align: 'center' });
  drawAvatar(ctx, input, width - 150, height - 150, 110);
  if (segment.kind === 'cta') drawCard(ctx, width, height, segment.caption, input.link);
  drawCountdownOf(ctx, input, board.x + board.size / 2, board.y + board.size / 2);
}

/** §13.4: the board with the side panel; a card for the hook, each chapter,
 * the outro and the end. */
function drawVideoFrame(ctx: CanvasRenderingContext2D, input: FrameInput, width: number, height: number): void {
  const board = { x: 60, y: 60, size: 960 };
  const { segment } = input;
  drawBoard(ctx, input, board.x, board.y, board.size);
  const panelX = 1080;
  // Cards carry their own text over the board.
  const caption = segment.kind === 'beat' || segment.kind === 'quiz' || segment.kind === 'tempting' || segment.kind === 'move' ? segment.caption : '';
  wrapText(ctx, input.title, { x: panelX, y: 130, maxWidth: 780, font: `700 52px ${FONT}`, color: COLORS.text, lineHeight: 62, maxLines: 3 });
  if (segment.moveLabel) text(ctx, segment.moveLabel, panelX, 360, `700 64px ${FONT}`, segment.kind === 'tempting' || (segment.kind === 'move' && caption) ? COLORS.arrows.threat : COLORS.accent);
  if (segment.kind === 'tempting') text(ctx, 'Tempting, but…', panelX, 440, `600 44px ${FONT}`, COLORS.muted);
  wrapText(ctx, caption, { x: panelX, y: 540, maxWidth: 780, font: `800 72px ${FONT}`, color: COLORS.text, lineHeight: 84, maxLines: 4 });
  drawAvatar(ctx, input, panelX, 860, 150);
  text(ctx, input.coachName, panelX + 180, 945, `600 42px ${FONT}`, COLORS.muted);

  if (segment.kind === 'title') drawCard(ctx, width, height, segment.caption || input.title, '');
  if (segment.kind === 'chapter') drawCard(ctx, width, height, segment.caption, input.title);
  if (segment.kind === 'outro') drawCard(ctx, width, height, segment.caption, `Learn it move by move: ${input.link}`);
  if (segment.kind === 'end') drawCard(ctx, width, height, input.title, `Learn it move by move: ${input.link}`);
  drawCountdownOf(ctx, input, board.x + board.size / 2, board.y + board.size / 2);
}

function drawCountdownOf(ctx: CanvasRenderingContext2D, input: FrameInput, x: number, y: number): void {
  const countdown = input.segment.pauseMs ? input.segment.end - input.ms : 0;
  if (countdown > 0 && countdown <= input.segment.pauseMs) drawCountdown(ctx, x, y, Math.ceil(countdown / 1000));
}

function drawBoard(ctx: CanvasRenderingContext2D, input: FrameInput, x: number, y: number, size: number): void {
  const square = size / 8;
  const flipped = input.orientation === 'black';
  const at = (name: string): [number, number] => {
    const file = name.charCodeAt(0) - 97;
    const rank = Number(name[1]) - 1;
    return [x + (flipped ? 7 - file : file) * square, y + (flipped ? rank : 7 - rank) * square];
  };
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      ctx.fillStyle = (rank + file) % 2 === 0 ? COLORS.dark : COLORS.light;
      const [sx, sy] = at(`${String.fromCharCode(97 + file)}${rank + 1}`);
      ctx.fillRect(sx, sy, square, square);
    }
  }
  const { lastMove, arrows } = input.segment;
  for (const name of lastMove ? [lastMove.from, lastMove.to] : []) {
    const [sx, sy] = at(name);
    ctx.fillStyle = COLORS.lastMove;
    ctx.fillRect(sx, sy, square, square);
  }
  for (const arrow of arrows.filter((each) => each.from === each.to)) {
    const [sx, sy] = at(arrow.from);
    ctx.fillStyle = `${COLORS.arrows[arrow.kind]}66`;
    ctx.fillRect(sx, sy, square, square);
  }
  for (const [name, code] of piecesOf(input.segment.fen)) {
    const image = input.assets.pieces.get(code);
    const [sx, sy] = at(name);
    if (image) ctx.drawImage(image, sx, sy, square, square);
  }
  for (const arrow of arrows.filter((each) => each.from !== each.to)) {
    const [fx, fy] = at(arrow.from);
    const [tx, ty] = at(arrow.to);
    drawArrow(ctx, fx + square / 2, fy + square / 2, tx + square / 2, ty + square / 2, square, COLORS.arrows[arrow.kind]);
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

function drawArrow(ctx: CanvasRenderingContext2D, fx: number, fy: number, tx: number, ty: number, square: number, color: string): void {
  const angle = Math.atan2(ty - fy, tx - fx);
  const head = square * 0.45;
  const endX = tx - Math.cos(angle) * head * 0.8;
  const endY = ty - Math.sin(angle) * head * 0.8;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = square * 0.17;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - Math.cos(angle - 0.5) * head, ty - Math.sin(angle - 0.5) * head);
  ctx.lineTo(tx - Math.cos(angle + 0.5) * head, ty - Math.sin(angle + 0.5) * head);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawAvatar(ctx: CanvasRenderingContext2D, input: FrameInput, x: number, y: number, size: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.panel;
  ctx.fill();
  ctx.clip();
  if (input.assets.avatar) {
    const [column, row] = AVATAR_CELL[input.persona];
    ctx.drawImage(input.assets.avatar, column * 256, AVATAR_TOP[row]!, 256, 256, x, y, size, size);
  }
  ctx.restore();
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCard(ctx: CanvasRenderingContext2D, width: number, height: number, title: string, line: string): void {
  ctx.fillStyle = 'rgba(20, 31, 25, 0.88)';
  ctx.fillRect(0, 0, width, height);
  const maxWidth = width * 0.84;
  wrapText(ctx, title, { x: width / 2, y: height * 0.4, maxWidth, font: `800 84px ${FONT}`, color: COLORS.text, lineHeight: 98, maxLines: 3, align: 'center' });
  wrapText(ctx, line, { x: width / 2, y: height * 0.62, maxWidth, font: `600 52px ${FONT}`, color: COLORS.accent, lineHeight: 64, maxLines: 3, align: 'center' });
}

function drawCountdown(ctx: CanvasRenderingContext2D, x: number, y: number, seconds: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(20, 31, 25, 0.72)';
  ctx.beginPath();
  ctx.arc(x, y, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.text;
  ctx.font = `800 180px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(seconds), x, y + 8);
  ctx.restore();
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, font: string, color: string): void {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  value: string,
  options: { x: number; y: number; maxWidth: number; font: string; color: string; lineHeight: number; maxLines: number; align?: CanvasTextAlign }
): void {
  ctx.font = options.font;
  ctx.fillStyle = options.color;
  ctx.textAlign = options.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > options.maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  lines.slice(0, options.maxLines).forEach((each, index) => ctx.fillText(each, options.x, options.y + index * options.lineHeight));
}

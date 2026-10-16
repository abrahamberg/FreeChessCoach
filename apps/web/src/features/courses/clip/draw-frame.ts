import { expectedPoints } from '@freechesscoach/chess-analysis';
import { COACH_PERSONAS, MOVE_QUALITY_SYMBOLS, type CoachPersona, type CourseArrow, type MoveQuality } from '@freechesscoach/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultPieces } from 'react-chessboard';
import { formatEval } from '../../board/EvalBar.js';
import { markAlpha } from './speech-marks.js';
import { CLIP_SIZES, type ClipSegment, type ClipTimeline } from './timeline.js';

/** Fixed colours: a clip looks the same whatever theme the creator uses.
 * They are the app's light-theme tokens (styles/tokens.css) and its board's. */
const COLORS = {
  background: '#141f19',
  panel: '#1d2b22',
  text: '#f7f8f5',
  muted: '#b9c2b5',
  accent: '#5b9c6a',
  /** The app's board: react-chessboard's own squares, which CoachBoard leaves
   * as they are. Not `--board-light`/`--board-dark`: those colour the
   * evaluation bar and the logo tile, and on the board they read as another
   * site's green. */
  light: '#f0d9b5',
  dark: '#b58863',
  /** `--board-light`, `--board-dark`: the evaluation bar's two sides, the logo's tile. */
  barLight: '#ede2c8',
  barDark: '#8ba173',
  /** `--last-move`: the app's own green, not the yellow of other sites' boards. */
  lastMove: 'rgba(130, 190, 130, 0.55)',
  /** The king in check, as the app's board lights it; stronger when mated. */
  check: '#e03131',
  /** A square the coach names, lit while it is said. */
  mark: '#ffd60a',
  arrows: { idea: '#c9762a', threat: '#c0392b', best: '#5b9c6a' } satisfies Record<CourseArrow['kind'], string>,
  /** `--quality-*`, the badge on a rated move; the glyph is dark except on
   * the three MoveQualityBadge.css turns white. */
  quality: {
    brilliant: '#2f7dc4',
    great: '#3f9fd1',
    best: '#5b9c6a',
    excellent: '#6fae7c',
    good: '#86bf8f',
    book: '#8a7355',
    inaccuracy: '#c9a227',
    mistake: '#d9622b',
    miss: '#a8477a',
    blunder: '#c0392b',
    forced: '#6f6a5e'
  } satisfies Record<MoveQuality, string>
};
const WHITE_GLYPH: readonly MoveQuality[] = ['brilliant', 'miss', 'blunder'];
const FONT = "'Inter Tight', Inter, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** One portrait per coach (public/brand/coaches/<persona>.png), transparent,
 * 2:3 (width:height). The avatar is a square cut from the top, around the
 * face, as CoachAvatar.css does. */
const AVATAR_TOP = 0.03;
/** The site's address: on the first slide, under the coach while the film
 * plays, and on the closing cards with the course's link. */
export const SITE_NAME = 'freechesscoach.org';

export interface ClipAssets {
  pieces: Map<string, HTMLImageElement>;
  /** Coach portraits by persona; a missing file is simply absent. */
  avatars: Map<string, HTMLImageElement>;
  /** public/brand/logo.png, dark green on transparent. */
  logo: HTMLImageElement | null;
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
  const avatars = new Map<string, HTMLImageElement>();
  const [logo] = await Promise.all([
    loadImage('/brand/logo.png').catch(() => null),
    ...COACH_PERSONAS.map(async (persona) => {
      const image = await loadImage(`/brand/coaches/${persona}.png`).catch(() => null);
      if (image) avatars.set(persona, image);
    })
  ]);
  return { pieces, avatars, logo };
}

export interface FrameInput {
  timeline: ClipTimeline;
  segment: ClipSegment;
  /** Time into the clip, for the quiz countdown. */
  ms: number;
  title: string;
  /** "Chess From Zero, lesson 7 of 14", on the title card; null for a course in no series. */
  series: string | null;
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
  drawEvalBar(ctx, input, { x: board.x, y: board.y - 22, width: board.size, height: 14 });
  const { segment } = input;
  if (segment.moveLabel) text(ctx, segment.moveLabel, 40, 1580, `700 48px ${FONT}`, COLORS.accent);
  wrapText(ctx, segment.caption, { x: width / 2, y: 1690, maxWidth: 980, font: `900 80px ${FONT}`, color: COLORS.text, lineHeight: 92, maxLines: 2, align: 'center' });
  drawAvatar(ctx, input, width - 150, height - 150, 110);
  text(ctx, SITE_NAME, 40, height - 80, `700 44px ${FONT}`, COLORS.muted);
  if (segment.kind === 'cta') drawCard(ctx, width, height, segment.caption, input.link, input.assets);
  drawCountdownOf(ctx, input, board.x + board.size / 2, board.y + board.size / 2);
}

/** §13.4: the board with the side panel; the start slide for the hook, a
 * card for each chapter, the outro and the end. */
function drawVideoFrame(ctx: CanvasRenderingContext2D, input: FrameInput, width: number, height: number): void {
  const board = { x: 60, y: 60, size: 960 };
  const { segment } = input;
  drawBoard(ctx, input, board.x, board.y, board.size);
  drawEvalBar(ctx, input, { x: 18, y: board.y, width: 26, height: board.size });
  if (segment.kind === 'title') {
    drawStartPanel(ctx, input, 1080);
    return;
  }
  const panelX = 1080;
  // Cards carry their own text over the board.
  const caption = segment.kind === 'beat' || segment.kind === 'quiz' || segment.kind === 'tempting' || segment.kind === 'move' ? segment.caption : '';
  wrapText(ctx, input.title, { x: panelX, y: 130, maxWidth: 780, font: `700 52px ${FONT}`, color: COLORS.text, lineHeight: 62, maxLines: 3 });
  if (segment.moveLabel) text(ctx, segment.moveLabel, panelX, 360, `700 64px ${FONT}`, segment.kind === 'tempting' || (segment.kind === 'move' && caption) ? COLORS.arrows.threat : COLORS.accent);
  if (segment.kind === 'tempting') text(ctx, temptingLabel(input), panelX, 440, `600 44px ${FONT}`, COLORS.muted);
  wrapText(ctx, caption, { x: panelX, y: 540, maxWidth: 780, font: `800 72px ${FONT}`, color: COLORS.text, lineHeight: 84, maxLines: 4 });
  drawAvatar(ctx, input, panelX, 860, 150);
  text(ctx, input.coachName, panelX + 180, 930, `600 42px ${FONT}`, COLORS.muted);
  text(ctx, SITE_NAME, panelX + 180, 985, `700 38px ${FONT}`, COLORS.accent);

  if (segment.kind === 'chapter') drawCard(ctx, width, height, segment.caption, input.title);
  if (segment.kind === 'outro') drawCard(ctx, width, height, firstQuestion(segment.caption), `Free course, move by move: ${input.link}`, input.assets);
  if (segment.kind === 'end') drawCard(ctx, width, height, input.title, `Free course, move by move: ${input.link}`, input.assets);
  drawCountdownOf(ctx, input, board.x + board.size / 2, board.y + board.size / 2);
}

/** A move that tempts the learner is a mistake to avoid; the opponent's is
 * a question ("what if they play this instead?"). The board faces the learner. */
function temptingLabel(input: FrameInput): string {
  const mover = input.segment.fen.split(' ')[1] === 'b' ? 'black' : 'white';
  return mover === input.orientation ? 'Tempting, but…' : 'What if…?';
}

/** The start slide's panel beside the climax board: the logo and the site,
 * the thumbnail text, the title and the coach, each sliding in after the
 * one before. */
function drawStartPanel(ctx: CanvasRenderingContext2D, input: FrameInput, x: number): void {
  const elapsed = input.ms - input.segment.start;
  const enter = (delay: number): number => Math.max(0, Math.min(1, (elapsed - delay) / 350));
  const eased = (delay: number): number => 1 - (1 - enter(delay)) ** 3;
  const slide = (delay: number, draw: () => void): void => {
    ctx.save();
    ctx.globalAlpha = enter(delay);
    ctx.translate((1 - eased(delay)) * 60, 0);
    draw();
    ctx.restore();
  };
  const gradient = ctx.createLinearGradient(x - 20, 0, 1920, 1080);
  gradient.addColorStop(0, COLORS.panel);
  gradient.addColorStop(1, COLORS.background);
  ctx.fillStyle = gradient;
  ctx.fillRect(x - 20, 0, 1920 - x + 20, 1080);

  slide(0, () => {
    roundRect(ctx, x, 60, 110, 110, 24);
    ctx.fillStyle = COLORS.barLight;
    ctx.fill();
    if (input.assets.logo) ctx.drawImage(input.assets.logo, x + 5, 65, 100, 100);
    text(ctx, SITE_NAME, x + 140, 132, `800 50px ${FONT}`, COLORS.text);
  });
  if (input.series) slide(75, () => wrapText(ctx, input.series ?? '', { x, y: 215, maxWidth: 780, font: `700 38px ${FONT}`, color: COLORS.accent, lineHeight: 46, maxLines: 1 }));
  slide(150, () => {
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(x, 250, 120, 12);
    wrapText(ctx, input.segment.caption || input.title, { x, y: 370, maxWidth: 520, font: `900 96px ${FONT}`, color: COLORS.text, lineHeight: 104, maxLines: 4 });
  });
  slide(300, () => wrapText(ctx, input.title, { x, y: 850, maxWidth: 520, font: `600 40px ${FONT}`, color: COLORS.muted, lineHeight: 50, maxLines: 3 }));
  slide(450, () => {
    drawPortrait(ctx, input, 1577, 440, 346);
    ctx.textAlign = 'center';
    ctx.font = `700 36px ${FONT}`;
    ctx.fillStyle = COLORS.accent;
    ctx.fillText(input.coachName, 1750, 1040);
  });
}

/** The coach's whole portrait standing in the corner. */
function drawPortrait(ctx: CanvasRenderingContext2D, input: FrameInput, x: number, y: number, width: number): void {
  const avatar = input.assets.avatars.get(input.persona);
  if (avatar) ctx.drawImage(avatar, x, y, width, width * 1.5);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
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
  if (input.segment.king) drawCheckedKing(ctx, input, at(input.segment.king.square), square);
  for (const name of input.segment.king?.shut ?? []) drawShutSquare(ctx, at(name), square);
  drawCoordinates(ctx, at, square, flipped);
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
  if (input.segment.rated && lastMove) drawQualityBadge(ctx, input.segment.rated.quality, at(lastMove.to), square);
  // The squares and moves the coach names, while they are said.
  const spokenMs = input.ms - input.segment.start - input.segment.audioOffsetMs;
  for (const mark of input.segment.marks ?? []) {
    const alpha = markAlpha(mark, spokenMs);
    if (!alpha) continue;
    const [fx, fy] = at(mark.from);
    if (mark.from === mark.to) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `${COLORS.mark}55`;
      ctx.fillRect(fx, fy, square, square);
      ctx.strokeStyle = COLORS.mark;
      ctx.lineWidth = square * 0.07;
      ctx.strokeRect(fx + ctx.lineWidth / 2, fy + ctx.lineWidth / 2, square - ctx.lineWidth, square - ctx.lineWidth);
      ctx.restore();
    } else {
      const [tx, ty] = at(mark.to);
      drawArrow(ctx, fx + square / 2, fy + square / 2, tx + square / 2, ty + square / 2, square, COLORS.arrows.idea, alpha * 0.85);
    }
  }
}

/** Square names as the app's board shows them: the ranks down the left-hand
 * file, the files along the bottom rank, each in the other square colour. */
function drawCoordinates(ctx: CanvasRenderingContext2D, at: (name: string) => [number, number], square: number, flipped: boolean): void {
  const pad = square * 0.06;
  ctx.save();
  ctx.font = `700 ${Math.round(square * 0.2)}px ${FONT}`;
  for (let index = 0; index < 8; index++) {
    const file = flipped ? 7 - index : index;
    const rank = flipped ? index : 7 - index;
    const left = String.fromCharCode(97 + (flipped ? 7 : 0));
    const bottomRank = flipped ? 8 : 1;
    const colorOf = (f: number, r: number): string => ((r + f) % 2 === 0 ? COLORS.light : COLORS.dark);
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

/** The move's quality on the corner of the square it landed on, as the
 * app's review pins it (MoveQualityBadgeOverlay). */
function drawQualityBadge(ctx: CanvasRenderingContext2D, quality: MoveQuality, [sx, sy]: [number, number], square: number): void {
  const radius = square * 0.2;
  // Inside the board even on its top row and right-hand file.
  const cx = sx + square - radius * 0.9;
  const cy = sy + radius * 0.9;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.quality[quality];
  ctx.fill();
  ctx.lineWidth = square * 0.025;
  ctx.strokeStyle = COLORS.text;
  ctx.stroke();
  ctx.fillStyle = WHITE_GLYPH.includes(quality) ? '#fff' : '#15140f';
  ctx.font = `800 ${Math.round(radius * 1.15)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(MOVE_QUALITY_SYMBOLS[quality], cx, cy + radius * 0.06);
  ctx.restore();
}

/**
 * The app's evaluation bar (EvalBar) beside the board: upright on the
 * YouTube video with White's share at White's end, lying above the board on
 * the reel with White's share from the left. A board the engine did not rate
 * keeps the bar's frame with no fill line and no figure, so nothing jumps.
 */
function drawEvalBar(ctx: CanvasRenderingContext2D, input: FrameInput, box: { x: number; y: number; width: number; height: number }): void {
  const { rated, king } = input.segment;
  const upright = box.height > box.width;
  ctx.save();
  roundRect(ctx, box.x, box.y, box.width, box.height, Math.min(box.width, box.height) / 3);
  ctx.clip();
  ctx.fillStyle = rated ? COLORS.barDark : COLORS.panel;
  ctx.fillRect(box.x, box.y, box.width, box.height);
  if (rated) {
    // The engine has no figure for a finished game: the mated side, the one
    // to move, has nothing left.
    const white = king?.mated ? (input.segment.fen.split(' ')[1] === 'w' ? 0 : 1) : expectedPoints(rated.cp);
    ctx.fillStyle = COLORS.barLight;
    if (!upright) ctx.fillRect(box.x, box.y, box.width * white, box.height);
    else if (input.orientation === 'white') ctx.fillRect(box.x, box.y + box.height * (1 - white), box.width, box.height * white);
    else ctx.fillRect(box.x, box.y, box.width, box.height * white);
  }
  ctx.restore();
  if (!rated || !upright) return;
  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(king?.mated ? '#' : formatEval(rated.cp), box.x + box.width / 2 + 6, box.y + box.height + 34);
}

/** The checked king's square: a red glow under the piece; a mated king's
 * fills the square, ringed, and pulses once a second so the eye finds it. */
function drawCheckedKing(ctx: CanvasRenderingContext2D, input: FrameInput, [sx, sy]: [number, number], square: number): void {
  const mated = input.segment.king?.mated ?? false;
  const pulse = mated ? 0.75 + 0.25 * Math.sin(((input.ms - input.segment.start) / 1000) * Math.PI * 2) : 1;
  const glow = ctx.createRadialGradient(sx + square / 2, sy + square / 2, square * 0.1, sx + square / 2, sy + square / 2, square * (mated ? 0.75 : 0.6));
  glow.addColorStop(0, COLORS.check);
  glow.addColorStop(1, mated ? `${COLORS.check}99` : `${COLORS.check}00`);
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = glow;
  ctx.fillRect(sx, sy, square, square);
  if (mated) {
    ctx.strokeStyle = COLORS.check;
    ctx.lineWidth = square * 0.08;
    ctx.strokeRect(sx + ctx.lineWidth / 2, sy + ctx.lineWidth / 2, square - ctx.lineWidth, square - ctx.lineWidth);
  }
  ctx.restore();
}

/** A square the mated king cannot run to: tinted red with a cross. */
function drawShutSquare(ctx: CanvasRenderingContext2D, [sx, sy]: [number, number], square: number): void {
  const inset = square * 0.34;
  ctx.save();
  ctx.fillStyle = `${COLORS.check}40`;
  ctx.fillRect(sx, sy, square, square);
  ctx.strokeStyle = `${COLORS.check}cc`;
  ctx.lineWidth = square * 0.06;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx + inset, sy + inset);
  ctx.lineTo(sx + square - inset, sy + square - inset);
  ctx.moveTo(sx + square - inset, sy + inset);
  ctx.lineTo(sx + inset, sy + square - inset);
  ctx.stroke();
  ctx.restore();
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

function drawArrow(ctx: CanvasRenderingContext2D, fx: number, fy: number, tx: number, ty: number, square: number, color: string, alpha = 0.85): void {
  const angle = Math.atan2(ty - fy, tx - fx);
  const head = square * 0.45;
  const endX = tx - Math.cos(angle) * head * 0.8;
  const endY = ty - Math.sin(angle) * head * 0.8;
  ctx.save();
  ctx.globalAlpha = alpha;
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
  const avatar = input.assets.avatars.get(input.persona);
  if (avatar) {
    const side = avatar.naturalWidth;
    ctx.drawImage(avatar, 0, Math.round(avatar.naturalHeight * AVATAR_TOP), side, side, x, y, size, size);
  }
  ctx.restore();
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.stroke();
}

/** The outro is spoken whole (the question, the sign-off, the ask); its
 * card shows the question only. */
function firstQuestion(outro: string): string {
  return /^.*?\?/.exec(outro)?.[0] ?? outro;
}

/** `brand`: the closing cards carry the logo and the site's address above the title. */
function drawCard(ctx: CanvasRenderingContext2D, width: number, height: number, title: string, line: string, brand?: ClipAssets): void {
  ctx.fillStyle = 'rgba(20, 31, 25, 0.88)';
  ctx.fillRect(0, 0, width, height);
  if (brand) drawBrand(ctx, brand, width / 2, height * 0.16);
  const maxWidth = width * 0.84;
  wrapText(ctx, title, { x: width / 2, y: height * 0.4, maxWidth, font: `800 84px ${FONT}`, color: COLORS.text, lineHeight: 98, maxLines: 3, align: 'center' });
  wrapText(ctx, line, { x: width / 2, y: height * 0.62, maxWidth, font: `600 52px ${FONT}`, color: COLORS.accent, lineHeight: 64, maxLines: 3, align: 'center' });
}

/** The logo tile and the site's address, centred on `x`. */
function drawBrand(ctx: CanvasRenderingContext2D, assets: ClipAssets, x: number, y: number): void {
  const tile = 120;
  ctx.font = `800 64px ${FONT}`;
  const nameWidth = ctx.measureText(SITE_NAME).width;
  const left = x - (tile + 30 + nameWidth) / 2;
  roundRect(ctx, left, y - tile / 2, tile, tile, 26);
  ctx.fillStyle = COLORS.barLight;
  ctx.fill();
  if (assets.logo) ctx.drawImage(assets.logo, left + 6, y - tile / 2 + 6, tile - 12, tile - 12);
  text(ctx, SITE_NAME, left + tile + 30, y + 22, `800 64px ${FONT}`, COLORS.text);
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

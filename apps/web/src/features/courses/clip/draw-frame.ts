import { expectedPoints } from '@freechesscoach/chess-analysis';
import { COACH_PERSONAS, MOVE_QUALITY_SYMBOLS, type CoachPersona, type CourseArrow, type CourseResponse, type MoveQuality } from '@freechesscoach/shared';
import { CANVAS_FONT as FONT, drawCoordinates, drawPieces, drawSquares, loadImage, loadPieceImages, squareOrigin } from '../../board/board-canvas.js';
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
  /** `--board-light`, `--board-dark`: the evaluation bar's two sides, the logo's tile. */
  barLight: '#ede2c8',
  barDark: '#8ba173',
  /** `--last-move`: the app's own green, not the yellow of other sites' boards. */
  lastMove: 'rgba(130, 190, 130, 0.55)',
  /** The king in check, as the app's board lights it; stronger when mated. */
  check: '#e03131',
  /** A square the coach names, lit while it is said; the reel's word being said. */
  mark: '#ffd60a',
  /** The reel's Subscribe button: the red every viewer knows as the ask. */
  subscribe: '#e5322d',
  arrows: { idea: '#c9762a', threat: '#c0392b', best: '#5b9c6a' } satisfies Record<CourseArrow['kind'], string>,
  /** The move just played: dotted, under the coach's own arrows; a sky blue
   * that reads on both squares and against the green of the last move. */
  moveArrow: '#4ea3f0',
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
/** How long the move just played keeps its arrow (the owner, 2026-10-18):
 * at most this, or the move's own segment when it is shorter. */
const MOVE_ARROW_MS = 750;
/** The arrow fades out over its last this long. */
const MOVE_ARROW_FADE_MS = 150;

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

/** The board's own piece set (react-chessboard's SVGs) as images, and the
 * coach portrait sheet. */
export async function loadClipAssets(): Promise<ClipAssets> {
  const pieces = await loadPieceImages();
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
  /** The PGN's players, labelled above and below the reel's board. */
  players?: CourseResponse['players'];
  /** How loud the coach's voice is now, 0–1 (ClipPlayer): the reel's coach moves with it. */
  voiceLevel?: number;
}

/** Draws one frame at the timeline's size: the reel's bands, or the
 * YouTube video's board and side panel. */
export function drawClipFrame(ctx: CanvasRenderingContext2D, input: FrameInput): void {
  const { width, height } = CLIP_SIZES[input.timeline.format];
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);
  if (input.timeline.product === 'reel') drawReelFrame(ctx, input, width);
  else drawVideoFrame(ctx, input, width, height);
}

/**
 * docs/courses.md §13.3, the reel at 1080×1920. TikTok, Shorts and Reels
 * cover the top ~270px, the bottom ~480px and a column of buttons on the
 * right from about y 1000 down (their ad templates; none publishes an
 * organic spec), so the coach sits top left beside the challenge, the board
 * and the captions in the middle, and nothing that matters lies right of
 * x 940 below the board's top half.
 */
const REEL = {
  coach: { x: 108, y: 270, size: 120 },
  /** The challenge beside the coach, centred on the coach's middle. */
  top: { x: 252, width: 688, middle: 330 },
  rowTop: 440,
  /** Its right edge is `right`: the h-file stays clear of the buttons. */
  board: { x: 108, y: 460, size: 832 },
  bar: { x: 52, width: 44 },
  rowBottom: 1340,
  caption: 1414,
  /** The right edge of what the platforms' buttons must not hide. */
  right: 940
};
/** The climax: how far the board zooms in on the move, and how long its quality pops. */
const CLIMAX_ZOOM = 0.12;
const CLIMAX_POP_MS = 1600;
/** A swing of the evaluation bar between two boards. */
const EVAL_SWING_MS = 400;
/** The reel's captions show this many words at a time. */
const CAPTION_WORDS = 3;

/** The top band holds the challenge from the first frame; the board with
 * its evaluation bar beside it and the players above and below; the
 * captions word by word under it. No title card, and the call to action
 * keeps the board in view so the loop runs on. */
function drawReelFrame(ctx: CanvasRenderingContext2D, input: FrameInput, width: number): void {
  const { segment } = input;
  const { board } = REEL;
  drawReelCoach(ctx, input);
  drawReelTop(ctx, input);
  const flipped = input.orientation === 'black';
  const [top, bottom] = flipped ? [input.players?.white, input.players?.black] : [input.players?.black, input.players?.white];
  drawPlayer(ctx, top ?? null, flipped ? 'w' : 'b', board.x, REEL.rowTop);
  drawBrandRow(ctx, input.assets, board.x + board.size, REEL.rowTop);

  const zoom = segment.climax ? climaxEnvelope(input) : 0;
  const landed = segment.lastMove ? squareCentre(segment.lastMove.to, board.x, board.y, board.size / 8, flipped) : null;
  ctx.save();
  ctx.beginPath();
  ctx.rect(board.x, board.y, board.size, board.size);
  ctx.clip();
  if (zoom && landed) {
    ctx.translate(landed[0], landed[1]);
    ctx.scale(1 + CLIMAX_ZOOM * zoom, 1 + CLIMAX_ZOOM * zoom);
    ctx.translate(-landed[0], -landed[1]);
  }
  drawBoard(ctx, input, board.x, board.y, board.size);
  ctx.restore();
  if (segment.climax && landed) drawClimaxPop(ctx, input, landed, board.size / 8);
  drawEvalBar(ctx, input, { x: REEL.bar.x, y: board.y, width: REEL.bar.width, height: board.size }, true);

  if (segment.kind === 'cta') {
    drawSubscribe(ctx, input, board.x + board.size / 2, board.y + board.size - 170);
    // The whole link always shows: smaller, and without its label when long.
    const full = `Free course: ${input.link}`;
    const fits = fitFont(ctx, full, board.size, 32, 24, 700);
    const line = fits ? full : input.link;
    const size = fits ?? fitFont(ctx, input.link, board.size, 32, 16, 700) ?? 16;
    wrapText(ctx, line, { x: board.x + board.size / 2, y: REEL.rowBottom, maxWidth: board.size + 1, font: `700 ${size}px ${FONT}`, color: COLORS.accent, lineHeight: size, maxLines: 1, align: 'center' });
  } else {
    drawPlayer(ctx, bottom ?? null, flipped ? 'b' : 'w', board.x, REEL.rowBottom);
    if (segment.moveLabel) {
      ctx.textAlign = 'right';
      ctx.font = `800 40px ${FONT}`;
      ctx.fillStyle = segment.climax ? COLORS.mark : COLORS.accent;
      ctx.fillText(segment.moveLabel, REEL.right, REEL.rowBottom);
    }
  }
  if (!drawSpokenWords(ctx, input, width / 2, REEL.caption, board.size)) {
    wrapText(ctx, segment.caption, { x: board.x + board.size / 2, y: REEL.caption, maxWidth: board.size, font: `900 60px ${FONT}`, color: COLORS.text, lineHeight: 66, maxLines: 1, align: 'center' });
  }
  drawCountdownOf(ctx, input, board.x + board.size / 2, board.y + board.size / 2, 'Pause and comment your move');
}

/** The coach top left, growing a little with their voice so they talk. */
function drawReelCoach(ctx: CanvasRenderingContext2D, input: FrameInput): void {
  const { x, y, size } = REEL.coach;
  const grown = size * (1 + 0.08 * (input.voiceLevel ?? 0));
  drawAvatar(ctx, input, x + (size - grown) / 2, y + (size - grown) / 2, grown);
}

/** The challenge ("White to play", "Mate in 3?") on one line, as large as
 * fits, with the series under it; two smaller lines when it is long. */
function drawReelTop(ctx: CanvasRenderingContext2D, input: FrameInput): void {
  const value = input.timeline.topText ?? '';
  const { x, width, middle } = REEL.top;
  const size = fitFont(ctx, value, width, 76, 48, 900);
  const series = input.series;
  if (size) {
    text(ctx, value, x, series ? middle + 4 : middle + size * 0.36, `900 ${size}px ${FONT}`, COLORS.text);
    if (series) wrapText(ctx, series, { x, y: middle + 50, maxWidth: width, font: `700 28px ${FONT}`, color: COLORS.accent, lineHeight: 34, maxLines: 1 });
    return;
  }
  wrapText(ctx, value, { x, y: middle - 12, maxWidth: width, font: `900 48px ${FONT}`, color: COLORS.text, lineHeight: 54, maxLines: 2 });
}

/** The largest size from `max` down to `min` at which `value` fits on one line; null when none does. */
function fitFont(ctx: CanvasRenderingContext2D, value: string, width: number, max: number, min: number, weight: number): number | null {
  for (let size = max; size >= min; size -= 4) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(value).width <= width) return size;
  }
  return null;
}

/** A side's player as a game screen shows them: the colour, the name, the rating. */
function drawPlayer(ctx: CanvasRenderingContext2D, player: { name: string; rating: number | null } | null, side: 'w' | 'b', x: number, y: number): void {
  if (!player) return;
  ctx.beginPath();
  ctx.arc(x + 14, y - 11, 13, 0, Math.PI * 2);
  ctx.fillStyle = side === 'w' ? COLORS.text : '#15140f';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.muted;
  ctx.stroke();
  const name = player.rating ? `${player.name}  ${player.rating}` : player.name;
  wrapText(ctx, name, { x: x + 40, y, maxWidth: 420, font: `700 32px ${FONT}`, color: COLORS.text, lineHeight: 38, maxLines: 1 });
}

/** The logo tile and the site's address, right-aligned to `right`. */
function drawBrandRow(ctx: CanvasRenderingContext2D, assets: ClipAssets, right: number, y: number): void {
  const tile = 48;
  ctx.font = `800 30px ${FONT}`;
  const nameWidth = ctx.measureText(SITE_NAME).width;
  const left = right - nameWidth - 12 - tile;
  roundRect(ctx, left, y - tile + 10, tile, tile, 11);
  ctx.fillStyle = COLORS.barLight;
  ctx.fill();
  if (assets.logo) ctx.drawImage(assets.logo, left + 3, y - tile + 13, tile - 6, tile - 6);
  text(ctx, SITE_NAME, right - nameWidth, y, `800 30px ${FONT}`, COLORS.text);
}

/** A square's centre on a board drawn at (x, y). */
function squareCentre(name: string, x: number, y: number, square: number, flipped: boolean): [number, number] {
  const [sx, sy] = squareOrigin(x, y, square, flipped ? 'black' : 'white')(name);
  return [sx + square / 2, sy + square / 2];
}

/** 0–1: the climax's zoom, in over 300 ms and out over its last 400. */
function climaxEnvelope(input: FrameInput): number {
  const elapsed = input.ms - input.segment.start;
  const left = input.segment.end - input.ms;
  const level = Math.max(0, Math.min(1, elapsed / 300, left / 400));
  return 1 - (1 - level) ** 3;
}

/** The climax qualities worth a pop; "★", "📖" or "→" means nothing at a climax. */
const POPPED: readonly MoveQuality[] = ['brilliant', 'great', 'blunder'];

/** The climax's quality ("!!", "!", "??", or "#" on mate) popping large over the square the move landed on. */
function drawClimaxPop(ctx: CanvasRenderingContext2D, input: FrameInput, [x, y]: [number, number], square: number): void {
  const { rated, king } = input.segment;
  const mated = king?.mated ?? false;
  if (!mated && !(rated && POPPED.includes(rated.quality))) return;
  const elapsed = input.ms - input.segment.start - 100;
  if (elapsed < 0 || elapsed > CLIMAX_POP_MS) return;
  const grow = Math.min(1, elapsed / 250);
  const scale = grow < 1 ? 0.3 + 0.9 * grow : Math.max(1, 1.2 - ((elapsed - 250) / 150) * 0.2);
  const radius = square * 0.85 * scale;
  const { board } = REEL;
  const cx = Math.max(board.x + radius, Math.min(board.x + board.size - radius, x + square * 0.5));
  const cy = Math.max(board.y + radius, Math.min(board.y + board.size - radius, y - square * 0.5));
  const quality = rated?.quality;
  ctx.save();
  ctx.globalAlpha = Math.min(1, (CLIMAX_POP_MS - elapsed) / 300);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = mated || !quality ? COLORS.check : COLORS.quality[quality];
  ctx.fill();
  ctx.lineWidth = 8 * scale;
  ctx.strokeStyle = COLORS.text;
  ctx.stroke();
  ctx.fillStyle = mated || (quality && WHITE_GLYPH.includes(quality)) ? '#fff' : '#15140f';
  ctx.font = `900 ${Math.round(radius * 0.95)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mated ? '#' : MOVE_QUALITY_SYMBOLS[quality!], cx, cy + radius * 0.05);
  ctx.restore();
}

/** The ask on the board, pulsing, with an arrow down to the platform's own button. */
function drawSubscribe(ctx: CanvasRenderingContext2D, input: FrameInput, x: number, y: number): void {
  const elapsed = input.ms - input.segment.start;
  const enter = Math.min(1, elapsed / 300);
  const scale = (0.6 + 0.4 * (1 - (1 - enter) ** 3)) * (1 + 0.04 * Math.sin((elapsed / 1000) * Math.PI * 3));
  const width = 560 * scale;
  const height = 120 * scale;
  ctx.save();
  ctx.globalAlpha = enter;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 24;
  roundRect(ctx, x - width / 2, y - height / 2, width, height, height / 2);
  ctx.fillStyle = COLORS.subscribe;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${Math.round(58 * scale)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SUBSCRIBE', x, y + 3 * scale);
  const bob = 10 * Math.sin((elapsed / 1000) * Math.PI * 4);
  const tip = y + height / 2 + 70 + bob;
  ctx.beginPath();
  ctx.moveTo(x - 34, tip - 36);
  ctx.lineTo(x + 34, tip - 36);
  ctx.lineTo(x, tip);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** The words being said, `CAPTION_WORDS` at a time, the one being said lit;
 * false when nothing is being said (the segment's caption shows instead). */
function drawSpokenWords(ctx: CanvasRenderingContext2D, input: FrameInput, x: number, y: number, maxWidth: number): boolean {
  const words = input.segment.words;
  if (!words?.length) return false;
  const spokenMs = input.ms - input.segment.start - input.segment.audioOffsetMs;
  if (spokenMs < 0 || spokenMs > words.at(-1)!.atMs + 700) return false;
  let current = 0;
  words.forEach((word, index) => {
    if (word.atMs <= spokenMs) current = index;
  });
  const first = current - (current % CAPTION_WORDS);
  const shown = words.slice(first, first + CAPTION_WORDS);
  const size = fitFont(ctx, shown.map((word) => word.text).join(' '), maxWidth, 68, 40, 900) ?? 40;
  ctx.font = `900 ${size}px ${FONT}`;
  const space = ctx.measureText(' ').width;
  const widths = shown.map((word) => ctx.measureText(word.text).width);
  let left = x - (widths.reduce((sum, each) => sum + each, 0) + space * (shown.length - 1)) / 2;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  shown.forEach((word, index) => {
    ctx.strokeText(word.text, left, y);
    ctx.fillStyle = first + index === current ? COLORS.mark : COLORS.text;
    ctx.fillText(word.text, left, y);
    left += widths[index]! + space;
  });
  ctx.restore();
  return true;
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

/** `label`: the reel's ask under the count, a comment being what lifts a reel. */
function drawCountdownOf(ctx: CanvasRenderingContext2D, input: FrameInput, x: number, y: number, label?: string): void {
  const countdown = input.segment.pauseMs ? input.segment.end - input.ms : 0;
  if (countdown <= 0 || countdown > input.segment.pauseMs) return;
  drawCountdown(ctx, x, y, Math.ceil(countdown / 1000));
  if (!label) return;
  ctx.font = `800 44px ${FONT}`;
  const width = ctx.measureText(label).width + 60;
  roundRect(ctx, x - width / 2, y + 180, width, 76, 38);
  ctx.fillStyle = 'rgba(20, 31, 25, 0.85)';
  ctx.fill();
  wrapText(ctx, label, { x, y: y + 233, maxWidth: width, font: `800 44px ${FONT}`, color: COLORS.mark, lineHeight: 50, maxLines: 1, align: 'center' });
}

function drawBoard(ctx: CanvasRenderingContext2D, input: FrameInput, x: number, y: number, size: number): void {
  const square = size / 8;
  const flipped = input.orientation === 'black';
  const at = squareOrigin(x, y, square, input.orientation);
  drawSquares(ctx, at, square);
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
  drawPieces(ctx, at, square, input.segment.fen, input.assets.pieces);
  const playedMs = input.ms - input.segment.start;
  if (input.segment.played && lastMove && playedMs < MOVE_ARROW_MS) {
    const [fx, fy] = at(lastMove.from);
    const [tx, ty] = at(lastMove.to);
    const alpha = 0.9 * Math.min(1, (MOVE_ARROW_MS - playedMs) / MOVE_ARROW_FADE_MS);
    drawArrow(ctx, fx + square / 2, fy + square / 2, tx + square / 2, ty + square / 2, square, COLORS.moveArrow, alpha, true);
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
 * The app's evaluation bar (EvalBar), upright beside the board, White's
 * share at White's end. The video has the figure under it; the reel, whose
 * bottom row is taken, has it inside the bar at the winning side's end. The
 * bar swings to a new board's figure instead of jumping. A board the engine
 * did not rate keeps the bar's frame with no fill line and no figure.
 */
function drawEvalBar(ctx: CanvasRenderingContext2D, input: FrameInput, box: { x: number; y: number; width: number; height: number }, figureInside = false): void {
  const { rated, king } = input.segment;
  const white = shownWhiteShare(input);
  ctx.save();
  roundRect(ctx, box.x, box.y, box.width, box.height, box.width / 3);
  ctx.clip();
  ctx.fillStyle = white === null ? COLORS.panel : COLORS.barDark;
  ctx.fillRect(box.x, box.y, box.width, box.height);
  if (white !== null) {
    ctx.fillStyle = COLORS.barLight;
    if (input.orientation === 'white') ctx.fillRect(box.x, box.y + box.height * (1 - white), box.width, box.height * white);
    else ctx.fillRect(box.x, box.y, box.width, box.height * white);
  }
  ctx.restore();
  if (!rated) return;
  const figure = king?.mated ? '#' : formatEval(rated.cp);
  ctx.textAlign = 'center';
  if (!figureInside) {
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = COLORS.muted;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(figure, box.x + box.width / 2 + 6, box.y + box.height + 34);
    return;
  }
  // Inside the bar at the end of the side ahead, in the other side's colour.
  const whiteAhead = (white ?? 0.5) >= 0.5;
  const atBottom = whiteAhead === (input.orientation === 'white');
  ctx.font = `800 ${figure.length > 4 ? 15 : 18}px ${FONT}`;
  ctx.fillStyle = whiteAhead ? '#15140f' : COLORS.text;
  ctx.textBaseline = atBottom ? 'bottom' : 'top';
  ctx.fillText(figure, box.x + box.width / 2, atBottom ? box.y + box.height - 8 : box.y + 8);
}

/** White's share of the bar on a segment's board, null when unrated; a mated side has nothing left. */
function whiteShare(segment: ClipSegment): number | null {
  if (!segment.rated) return null;
  if (segment.king?.mated) return segment.fen.split(' ')[1] === 'w' ? 0 : 1;
  return expectedPoints(segment.rated.cp);
}

/** The bar's fill now: easing from the board before over `EVAL_SWING_MS`. */
function shownWhiteShare(input: FrameInput): number | null {
  const now = whiteShare(input.segment);
  const index = input.timeline.segments.indexOf(input.segment);
  const before = index > 0 ? whiteShare(input.timeline.segments[index - 1]!) : null;
  const t = (input.ms - input.segment.start) / EVAL_SWING_MS;
  if (now === null || before === null || t >= 1) return now;
  return before + (now - before) * (1 - (1 - Math.max(0, t)) ** 3);
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

/** An arrow from square centre to square centre; `dotted`: a row of dots
 * and a smaller head, for the move just played. A knight's jump bends: the
 * long leg first, then the short one (the owner, 2026-10-18). */
function drawArrow(ctx: CanvasRenderingContext2D, fx: number, fy: number, tx: number, ty: number, square: number, color: string, alpha = 0.85, dotted = false): void {
  const files = Math.round(Math.abs(tx - fx) / square);
  const ranks = Math.round(Math.abs(ty - fy) / square);
  const knight = (files === 1 && ranks === 2) || (files === 2 && ranks === 1);
  const [cx, cy] = knight ? (files > ranks ? [tx, fy] : [fx, ty]) : [fx, fy];
  const angle = Math.atan2(ty - cy, tx - cx);
  const head = square * (dotted ? 0.32 : 0.45);
  const endX = tx - Math.cos(angle) * head * 0.8;
  const endY = ty - Math.sin(angle) * head * 0.8;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = square * (dotted ? 0.13 : 0.17);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dotted) ctx.setLineDash([0, square * 0.2]);
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  if (knight) ctx.lineTo(cx, cy);
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

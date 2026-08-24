import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import './GameEvalChart.css';

export interface GameEvalChartProps {
  classifiedMoves: ClassifiedMoveDto[];
  currentPly: number;
  onSelect: (ply: number) => void;
}

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 44;
/** Visual clamp only (evalAfterCp itself isn't globally clamped like this —
 * only mate scores are, to +-1000cp in classify.ts) — keeps one lopsided
 * swing from squashing the rest of the game's curve flat. */
const CLAMP_CP = 800;
/** Faint reference lines either side of zero — cheap depth cue, no axis
 * labels needed at this size. */
const GRID_LINES_CP = [400, -400];

function formatEval(cp: number): string {
  const pawns = cp / 100;
  const sign = pawns > 0 ? '+' : '';
  return `${sign}${pawns.toFixed(1)}`;
}

function moveLabel(move: ClassifiedMoveDto): string {
  const number = move.moveNumber ?? Math.ceil(move.ply / 2);
  return `${number}${move.mover === 'white' ? '.' : '…'} ${move.moveSan}`;
}

/** Catmull-Rom-to-Bezier smoothing (tension 1/6) — evenly-spaced points (one
 * per ply) make this cheap and it turns a jagged polyline into a proper
 * curve without pulling in a charting library (design convention shared
 * with TrendChart.tsx: plain SVG, no dependency). */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(i + 2, points.length - 1)]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Hand-rolled SVG area chart of the whole game's evaluation swing (design
 * convention matches TrendChart.tsx: no charting library, plain divs/SVG),
 * docked in the empty space below the board on desktop. Presentational only
 * (AGENTS.md rule 7) — classifiedMoves/currentPly come from the parent,
 * which already has them loaded with the game; clicking anywhere seeks via
 * onSelect, same callback the move list itself uses.
 *
 * The line/area live in an SVG stretched to fill the card
 * (preserveAspectRatio="none", the standard sparkline trick) — but that
 * same stretching would squash a plain SVG <circle> into an ellipse, which
 * is what made the old blunder/cursor dots look warped and "childish". So
 * every point marker (blunder dots, the current-ply dot, the hover dot) is
 * a real DOM element in `__markers`, positioned by percentage over the SVG
 * and sized in real pixels — genuinely round on any card aspect ratio. */
export function GameEvalChart({ classifiedMoves, currentPly, onSelect }: GameEvalChartProps): ReactNode {
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);

  const totalPlies = classifiedMoves.length;
  const toX = (ply: number) => (ply / Math.max(totalPlies, 1)) * VIEW_WIDTH;
  const toY = (cp: number) => {
    const clamped = Math.max(-CLAMP_CP, Math.min(CLAMP_CP, cp));
    return VIEW_HEIGHT / 2 - (clamped / CLAMP_CP) * (VIEW_HEIGHT / 2);
  };

  const coords = useMemo(
    () => [{ ply: 0, cp: 0 }, ...classifiedMoves.map((move) => ({ ply: move.ply, cp: move.evalAfterCp }))].map((point) => ({
      x: toX(point.ply),
      y: toY(point.cp)
    })),
    [classifiedMoves, totalPlies]
  );

  if (classifiedMoves.length === 0) {
    return <div className="game-eval-chart game-eval-chart--empty">Evaluation not available yet.</div>;
  }

  const linePath = smoothPath(coords);
  const areaPath = `${linePath} L ${toX(totalPlies)} ${VIEW_HEIGHT / 2} L ${toX(0)} ${VIEW_HEIGHT / 2} Z`;
  const blunders = classifiedMoves.filter((move) => move.quality === 'blunder');
  const currentPoint = coords[Math.min(currentPly, coords.length - 1)]!;

  function plyFromEvent(event: MouseEvent<SVGSVGElement>): number {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return Math.round(fraction * totalPlies);
  }

  function handleClick(event: MouseEvent<SVGSVGElement>): void {
    onSelect(plyFromEvent(event));
  }

  function handleMouseMove(event: MouseEvent<SVGSVGElement>): void {
    // Snap to the nearest ply's own point rather than following the raw
    // cursor — a steadier, more deliberate feel than a jittery free line.
    setHoverFraction(plyFromEvent(event) / totalPlies);
  }

  const hoveredPly = hoverFraction === null ? null : Math.round(hoverFraction * totalPlies);
  const hoveredMove = hoveredPly !== null && hoveredPly > 0 ? classifiedMoves[hoveredPly - 1] : undefined;
  const hoveredPoint = hoveredPly === null ? null : coords[hoveredPly];

  function pct(value: { x: number; y: number }): { left: string; top: string } {
    return { left: `${(value.x / VIEW_WIDTH) * 100}%`, top: `${(value.y / VIEW_HEIGHT) * 100}%` };
  }

  return (
    <div className="game-eval-chart">
      <svg
        className="game-eval-chart__svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverFraction(null)}
        role="img"
        aria-label="Evaluation across the whole game — click to jump to a move"
      >
        <defs>
          {/* White/black fill split at the zero line — one area path, two
           * clipped copies, each fading toward the baseline. A single
           * accent-tinted hue on both sides (not literal board-square
           * colors) reads as a chart, not a chessboard texture. */
          }
          <clipPath id="game-eval-chart-top" clipPathUnits="userSpaceOnUse">
            <rect x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT / 2} />
          </clipPath>
          <clipPath id="game-eval-chart-bottom" clipPathUnits="userSpaceOnUse">
            <rect x={0} y={VIEW_HEIGHT / 2} width={VIEW_WIDTH} height={VIEW_HEIGHT / 2} />
          </clipPath>
          <linearGradient id="game-eval-chart-white-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-text)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--color-text)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="game-eval-chart-black-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-text)" stopOpacity="0.03" />
            <stop offset="100%" stopColor="var(--color-text)" stopOpacity="0.22" />
          </linearGradient>
        </defs>
        {GRID_LINES_CP.map((cp) => (
          <line key={cp} x1={0} y1={toY(cp)} x2={VIEW_WIDTH} y2={toY(cp)} className="game-eval-chart__grid-line" />
        ))}
        <line x1={0} y1={VIEW_HEIGHT / 2} x2={VIEW_WIDTH} y2={VIEW_HEIGHT / 2} className="game-eval-chart__zero-line" />
        <path d={areaPath} clipPath="url(#game-eval-chart-top)" fill="url(#game-eval-chart-white-fill)" />
        <path d={areaPath} clipPath="url(#game-eval-chart-bottom)" fill="url(#game-eval-chart-black-fill)" />
        <path d={linePath} className="game-eval-chart__line" />
        {hoverFraction !== null && (
          <line
            x1={hoverFraction * VIEW_WIDTH}
            y1={0}
            x2={hoverFraction * VIEW_WIDTH}
            y2={VIEW_HEIGHT}
            className="game-eval-chart__hover-line"
          />
        )}
        <line x1={toX(currentPly)} y1={0} x2={toX(currentPly)} y2={VIEW_HEIGHT} className="game-eval-chart__cursor" />
      </svg>
      {/* Real, round DOM markers — see the component doc comment for why
       * these can't be plain SVG circles. */}
      <div className="game-eval-chart__markers">
        {blunders.map((move) => (
          <span
            key={move.ply}
            className="game-eval-chart__marker game-eval-chart__marker--blunder"
            style={pct({ x: toX(move.ply), y: toY(move.evalAfterCp) })}
          />
        ))}
        {hoveredPoint && (
          <span className="game-eval-chart__marker game-eval-chart__marker--hover" style={pct(hoveredPoint)} />
        )}
        <span className="game-eval-chart__marker game-eval-chart__marker--cursor" style={pct(currentPoint)} />
      </div>
      {hoveredMove && (
        <div
          className="game-eval-chart__tooltip"
          style={{ left: `${Math.min(92, Math.max(8, (hoverFraction ?? 0) * 100))}%` }}
        >
          <span className="game-eval-chart__tooltip-move">{moveLabel(hoveredMove)}</span>
          <span className="game-eval-chart__tooltip-eval">{formatEval(hoveredMove.evalAfterCp)}</span>
        </div>
      )}
    </div>
  );
}

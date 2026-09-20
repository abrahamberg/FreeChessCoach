import type { BotThinkingMove, BotThinkingStep } from '@freechesscoach/shared';

/** "42ms" under a second, "3.46s" from there on — the same reading in the
 * panel and in the text a player copies out of it. Clamped at 0 so a clock
 * hiccup never shows a negative duration. */
export function formatDuration(ms: number): string {
  const clamped = Math.max(0, ms);
  return clamped < 1000 ? `${Math.round(clamped)}ms` : `${(clamped / 1000).toFixed(2)}s`;
}

/** How long a step took — or, while it is still running, how long it has been
 * running so far. */
export function stepDurationMs(step: BotThinkingStep, now: number): number {
  return (step.endedAt ?? now) - step.startedAt;
}

export function moveDurationMs(move: BotThinkingMove, now: number): number {
  return (move.endedAt ?? now) - move.startedAt;
}

/** "Move 3 · White (ply 5)" — odd plies are White's, matching the rest of the
 * app. A ply the server had not worked out yet reads as a plain "Bot move". */
export function describeMoveHeading(move: BotThinkingMove): string {
  if (move.ply === null) return 'Bot move';
  const side = move.ply % 2 === 1 ? 'White' : 'Black';
  return `Move ${Math.ceil(move.ply / 2)} · ${side} (ply ${move.ply})`;
}

export function describeMoveState(move: BotThinkingMove, now: number): string {
  const duration = formatDuration(moveDurationMs(move, now));
  if (move.status === 'thinking') return `THINKING for ${duration}`;
  if (move.status === 'failed') return `FAILED after ${duration}`;
  return `done in ${duration}`;
}

function describeMoveLine(move: BotThinkingMove, now: number): string {
  return [
    describeMoveHeading(move),
    describeMoveState(move, now),
    move.picked && `played ${move.picked}`,
    move.path,
    move.engineMode && `engine: ${move.engineMode}`,
    `from: ${move.source}`
  ]
    .filter(Boolean)
    .join(' — ');
}

function describeStepMarker(step: BotThinkingStep): string {
  if (step.status === 'running') return ' [running]';
  if (step.status === 'failed') return ' [failed]';
  return '';
}

function describeStepLine(step: BotThinkingStep, move: BotThinkingMove, now: number): string {
  const offset = `+${formatDuration(step.startedAt - move.startedAt)}`.padEnd(9);
  const duration = formatDuration(stepDurationMs(step, now)).padStart(6);
  const marker = describeStepMarker(step);
  const detail = step.detail ? ` — ${step.detail}` : '';
  return `  ${offset}${duration}  ${step.label}${marker}${detail}`;
}

/** Plain text for the "Copy log" button: every move oldest first, each with
 * its steps as offset / duration / label / detail, so a player can paste it
 * straight into a bug report and it reads without the UI. */
export function formatBotThinkingLog(moves: BotThinkingMove[], now: number): string {
  if (moves.length === 0) return 'No bot moves recorded yet.';
  return moves
    .map((move) => [describeMoveLine(move, now), ...move.steps.map((step) => describeStepLine(step, move, now))].join('\n'))
    .join('\n\n');
}

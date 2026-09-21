import type { BotThinkingMove, BotThinkingStep } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { describeMoveHeading, describeMoveState, formatDuration, stepDurationMs } from './botThinkingFormat.js';
import './BotThinkingLog.css';

export interface BotThinkingLogProps {
  /** Oldest first, as the API returns them — shown newest first. */
  moves: BotThinkingMove[];
  /** Date.now() as of this render, so a running step's time keeps counting
   * up; the caller re-renders on a timer while anything is still running. */
  now: number;
}

function StepRow({ step, moveStartedAt, now }: { step: BotThinkingStep; moveStartedAt: number; now: number }): ReactNode {
  return (
    <li className="bot-thinking-log__step" data-status={step.status}>
      <span className="bot-thinking-log__offset">{`+${formatDuration(step.startedAt - moveStartedAt)}`}</span>
      <span className="bot-thinking-log__label">{step.label}</span>
      <span className="bot-thinking-log__duration">{formatDuration(stepDurationMs(step, now))}</span>
      {step.detail && <span className="bot-thinking-log__detail">{step.detail}</span>}
    </li>
  );
}

function MoveEntry({ move, now, isLatest }: { move: BotThinkingMove; now: number; isLatest: boolean }): ReactNode {
  return (
    <details className="bot-thinking-log__move" data-status={move.status} open={isLatest}>
      <summary className="bot-thinking-log__summary">
        <span className="bot-thinking-log__heading">{describeMoveHeading(move)}</span>
        <span className="bot-thinking-log__state">{describeMoveState(move, now)}</span>
        {move.picked && <span className="bot-thinking-log__picked">{`played ${move.picked}`}</span>}
        {move.path && <span className="bot-thinking-log__path">{move.path}</span>}
      </summary>
      <ol className="bot-thinking-log__steps">
        {move.steps.map((step) => (
          <StepRow key={step.id} step={step} moveStartedAt={move.startedAt} now={now} />
        ))}
      </ol>
    </details>
  );
}

/** The bot's Thinking log: one entry per move, newest first and open, each
 * listing every step it took with when it started (offset from the start of
 * that move), how long it ran, and what it did. Purely presentational —
 * BotThinkingPanel owns the fetching and the clock. */
export function BotThinkingLog({ moves, now }: BotThinkingLogProps): ReactNode {
  if (moves.length === 0) return <p className="bot-thinking-log__empty">No bot moves yet.</p>;

  const newestFirst = [...moves].reverse();
  return (
    <div className="bot-thinking-log">
      {newestFirst.map((move, index) => (
        <MoveEntry key={`${move.startedAt}-${move.ply}`} move={move} now={now} isLatest={index === 0} />
      ))}
    </div>
  );
}

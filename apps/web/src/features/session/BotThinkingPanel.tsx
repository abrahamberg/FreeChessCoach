import { useEffect, useState, type ReactNode } from 'react';
import { BotThinkingLog } from './BotThinkingLog.js';
import { formatBotThinkingLog } from './botThinkingFormat.js';
import { useBotThinkingLog } from './useBotThinkingLog.js';
import { useTickingNow } from './useTickingNow.js';
import './BotThinkingLog.css';

export interface BotThinkingPanelProps {
  sessionId: string;
  /** True while the position on screen is waiting on the bot. */
  isBotTurn: boolean;
}

type CopyState = 'idle' | 'copied' | 'failed';

const COPY_FEEDBACK_MS = 2000;

const COPY_LABEL: Record<CopyState, string> = { idle: 'Copy log', copied: 'Copied', failed: 'Copy failed' };

/** Shows "Copied"/"Copy failed" for a moment after a copy attempt, then goes
 * back to "Copy log". The clipboard can be refused (permissions, insecure
 * context), and that must be visible rather than a button that does nothing. */
function useCopyFeedback(): { copyState: CopyState; copy: (text: string) => void } {
  const [copyState, setCopyState] = useState<CopyState>('idle');

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = setTimeout(() => setCopyState('idle'), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copyState]);

  const copy = (text: string): void => {
    navigator.clipboard.writeText(text).then(
      () => setCopyState('copied'),
      () => setCopyState('failed')
    );
  };

  return { copyState, copy };
}

/**
 * The "Thinking log" in the bot's status panel: what the bot is doing right
 * now and, below it, what it did for each earlier move — every step with when
 * it started, how long it ran and what it did — so a slow or stuck move can be
 * pointed at exactly. Reads GET /api/sessions/:id/bot-thinking; "Copy log"
 * turns the whole thing into text to paste into a report.
 */
export function BotThinkingPanel({ sessionId, isBotTurn }: BotThinkingPanelProps): ReactNode {
  const { moves } = useBotThinkingLog(sessionId, { isBotTurn });
  const [isOpen, setIsOpen] = useState(true);
  const isLive = isBotTurn || moves.some((move) => move.status === 'thinking');
  const now = useTickingNow(isLive);
  const { copyState, copy } = useCopyFeedback();

  return (
    <section className="bot-thinking-panel" aria-label="Bot thinking log">
      <div className="bot-thinking-panel__header">
        <button type="button" className="bot-thinking-panel__toggle" aria-expanded={isOpen} onClick={() => setIsOpen((value) => !value)}>
          <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span> <span>Thinking log</span>
        </button>
        <button type="button" className="bot-thinking-panel__copy" onClick={() => copy(formatBotThinkingLog(moves, Date.now()))}>
          {COPY_LABEL[copyState]}
        </button>
      </div>
      {isOpen && <BotThinkingLog moves={moves} now={now} />}
    </section>
  );
}

import type { ReactNode } from 'react';
import { BotAvatar } from '../../components/BotAvatar.js';
import { FlagIcon } from '../../components/Icon.js';
import { useLiteEngineHint } from '../../hooks/useLiteEngineHint.js';
import { ClockDisplay } from './ClockDisplay.js';
import './BotStatusPanel.css';

export interface BotGameOverInfo {
  result: '1-0' | '0-1' | '1/2-1/2';
  reason: 'checkmate' | 'stalemate' | 'insufficient_material' | 'threefold_repetition' | 'fifty_move_rule';
}

export interface BotStatusPanelProps {
  botName: string;
  /** The roster entry's sprite index (BotConfig.avatarIndex) — looked up
   * client-side from the shared BOT_ROSTER by BotSessionPage, not fetched.
   * Optional so a not-yet-loaded/unknown bot degrades to a placeholder
   * rather than requiring every caller to resolve one first. */
  botAvatarIndex?: number;
  botElo?: number;
  /** Whose turn it is right now. The whole "player move + bot's synchronous
   * reply" round trip resolves as one request before any UI update happens
   * (see usePlayBotMoveSubmit), so there's no genuinely observable
   * mid-request "bot is thinking" gap to animate — this reflects the
   * position on screen, not a live request state. */
  isPlayerTurn: boolean;
  gameOver: BotGameOverInfo | null;
  userColor: 'white' | 'black';
  /** The "flag" button — resigns immediately. Omitted while the resign
   * request is already in flight or the game has already ended. */
  onResign?: () => void;
  /** Present only for a timed game (see BotClockConfigSchema) — omitted
   * entirely (no ClockDisplay rendered) for an untimed one. */
  clock?: { whiteRemainingMs: number; blackRemainingMs: number; anchoredAt: number } | null;
  activeColor?: 'white' | 'black';
  onClockExpire?: () => void;
  /** Current position, for the just-in-time lite-engine hint readout below —
   * omitted (no readout at all) rather than defaulted, since a caller that
   * doesn't track a live fen shouldn't silently get a stale/empty hint. */
  fen?: string;
}

/** "if the light engine is not loaded the bot shows that the light engine
 * is not loaded until it's loaded" — this panel only exists once the caller
 * is already showing the status bar (BotSessionPage gates the whole
 * BotStatusPanel on that), so no separate on/off toggle is needed here. */
function LiteHintReadout({ fen }: { fen: string }): ReactNode {
  const { status, evaluation } = useLiteEngineHint({ enabled: true, fen });

  if (status === 'not-loaded' || status === 'loading') {
    return (
      <p className="bot-status-panel__hint bot-status-panel__hint--loading" role="status">
        Live analysis: light engine not loaded yet…
      </p>
    );
  }

  if (!evaluation) return null;

  return (
    <p className="bot-status-panel__hint" role="status">
      <span className="bot-status-panel__hint-label">Exploratory:</span> {evaluation}
    </p>
  );
}

const DRAW_REASON_TEXT: Record<Exclude<BotGameOverInfo['reason'], 'checkmate'>, string> = {
  stalemate: 'Draw by stalemate.',
  insufficient_material: 'Draw by insufficient material.',
  threefold_repetition: 'Draw by threefold repetition.',
  fifty_move_rule: 'Draw by the fifty-move rule.'
};

function describeGameOver(gameOver: BotGameOverInfo, userColor: 'white' | 'black', botName: string): string {
  if (gameOver.reason === 'checkmate') {
    const userWon = (userColor === 'white' && gameOver.result === '1-0') || (userColor === 'black' && gameOver.result === '0-1');
    return userWon ? 'Checkmate — you win!' : `Checkmate — ${botName} wins.`;
  }
  return DRAW_REASON_TEXT[gameOver.reason];
}

/** The chat-less bot session's status panel — replaces ChatPane in the
 * play_bot layout ("Play vs Bot" plan). */
export function BotStatusPanel({
  botName,
  botAvatarIndex,
  botElo,
  isPlayerTurn,
  gameOver,
  userColor,
  onResign,
  clock,
  activeColor,
  onClockExpire,
  fen
}: BotStatusPanelProps): ReactNode {
  return (
    <div className="bot-status-panel">
      {clock && activeColor && onClockExpire && (
        <ClockDisplay
          whiteRemainingMs={clock.whiteRemainingMs}
          blackRemainingMs={clock.blackRemainingMs}
          activeColor={activeColor}
          anchoredAt={clock.anchoredAt}
          onExpire={onClockExpire}
        />
      )}
      <div className="bot-status-panel__opponent">
        {botAvatarIndex !== undefined && <BotAvatar avatarIndex={botAvatarIndex} size="panel" />}
        <span className="bot-status-panel__name">{botName}</span>
        {botElo !== undefined && <span className="bot-status-panel__level">{botElo}</span>}
      </div>
      {gameOver ? (
        <p className="bot-status-panel__result" role="status">
          {describeGameOver(gameOver, userColor, botName)}
        </p>
      ) : (
        <p className="bot-status-panel__turn" role="status">
          {isPlayerTurn ? 'Your move' : `${botName} is thinking…`}
        </p>
      )}
      {onResign && !gameOver && (
        <button type="button" className="bot-status-panel__resign" onClick={onResign}>
          <FlagIcon width={15} height={15} />
          Resign
        </button>
      )}
      {fen && !gameOver && <LiteHintReadout fen={fen} />}
    </div>
  );
}

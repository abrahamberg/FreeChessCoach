import type { ReactNode } from 'react';
import { AvatarNoteRow } from '../../components/AvatarNoteRow.js';
import { BotAvatar } from '../../components/BotAvatar.js';
import { FlagIcon } from '../../components/Icon.js';
import { useLiteEngineHint } from '../../hooks/useLiteEngineHint.js';
import { describeGameOver, type BotGameOverInfo } from './botGameOver.js';
import { ClockDisplay } from './ClockDisplay.js';
import './BotStatusPanel.css';

export interface BotStatusPanelProps {
  botName: string;
  /** The roster entry's sprite index (BotConfig.avatarIndex) — looked up
   * client-side from the shared BOT_ROSTER by BotSessionPage, not fetched.
   * Optional so a not-yet-loaded/unknown bot degrades to a placeholder
   * rather than requiring every caller to resolve one first. */
  botAvatarIndex?: number;
  botElo?: number;
  /** Whose turn it is right now, as reflected by the position on screen —
   * the player's own drop already looks committed (the board's optimistic
   * preview) well before the "player move + bot's synchronous reply" round
   * trip (usePlayBotMoveSubmit) actually resolves, so this alone still reads
   * "Your move" for the whole wait. `isBotThinking` below is what covers
   * that gap. */
  isPlayerTurn: boolean;
  /** True for the live duration of that round trip (usePlayBotMoveSubmit's
   * own `isSubmitting`, threaded down through SessionBoardColumn) — shows
   * "{botName} is thinking…" even though `isPlayerTurn` hasn't flipped yet,
   * so the wait (which the engine's own movetime cap still bounds, but can
   * still take several seconds) isn't silent. Defaults false so a caller
   * that doesn't track submission state (there is none today, but this
   * keeps the prop optional) degrades to the old position-only text. */
  isBotThinking?: boolean;
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
  /** 'panel' (default): the full-height, centered layout for a dedicated
   * column of its own (desktop's side-by-side layout — SessionPage.css's
   * `.session-body.desktop .bot-status-panel`). 'card': a compact,
   * left-aligned row — the bot's portrait beside the status text, same
   * shape as MoveNoteCard/PagedMessageCard — for the mobile stacked layout,
   * where this sits above the board instead of owning a whole screen. */
  variant?: 'panel' | 'card';
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

/** The chat-less bot session's status panel — replaces ChatPane in the
 * play_bot layout ("Play vs Bot" plan). `variant="card"` moves the bot's
 * portrait out to an AvatarNoteRow sibling (mirroring MoveNoteCard/
 * PagedMessageCard) instead of rendering it inside `__opponent` — same
 * status content either way, just re-homed for the compact mobile shape. */
export function BotStatusPanel({
  botName,
  botAvatarIndex,
  botElo,
  isPlayerTurn,
  isBotThinking = false,
  gameOver,
  userColor,
  onResign,
  clock,
  activeColor,
  onClockExpire,
  fen,
  variant = 'panel'
}: BotStatusPanelProps): ReactNode {
  const content = (
    <div className={`bot-status-panel bot-status-panel--${variant}`}>
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
        {variant === 'panel' && botAvatarIndex !== undefined && <BotAvatar avatarIndex={botAvatarIndex} size="panel" />}
        <span className="bot-status-panel__name">{botName}</span>
        {botElo !== undefined && <span className="bot-status-panel__level">{botElo}</span>}
      </div>
      {gameOver ? (
        <p className="bot-status-panel__result" role="status">
          {describeGameOver(gameOver, userColor, botName)}
        </p>
      ) : (
        <p className="bot-status-panel__turn" role="status">
          {isPlayerTurn && !isBotThinking ? 'Your move' : `${botName} is thinking…`}
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

  if (variant === 'card') {
    return (
      <AvatarNoteRow className="bot-status-card-row">
        {botAvatarIndex !== undefined && <BotAvatar avatarIndex={botAvatarIndex} size="card" />}
        {content}
      </AvatarNoteRow>
    );
  }

  return content;
}

import type { GameListItem, GameSource } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { CalendarIcon, EyeIcon, MessageCircleIcon } from '../../components/Icon.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { OverflowMenu } from '../../components/OverflowMenu.js';
import './GameRow.css';

export interface GameRowProps {
  game: GameListItem;
  /** The row's one single action for every status except a ready analysis
   * (an in-progress play session's "Continue") — see `onReview`/`onCoach`
   * for the ready case, which always offers both rather than one or the
   * other. */
  onSelect: (gameId: string) => void;
  /** Opens the static Review page — offered on every ready game regardless
   * of source or how many times it's been opened before; there is no tier
   * to "use up" by reviewing. */
  onReview: (gameId: string) => void;
  /** Starts (or resumes) a coaching session for this game — every ready
   * game offers this alongside Review, source and prior visits included:
   * reviewing and coaching are two different things you can always do with
   * the same game, not two rungs of one ladder. */
  onCoach: (gameId: string) => void;
  onAnalyze: (gameId: string) => void;
  onExportPgn: (gameId: string) => void;
  onCopyPgn: (gameId: string) => void;
  onDelete: (gameId: string) => void;
}

/** Source is metadata, not navigation — every source funnels into one of
 * three groups (GamesPage's own tab filter uses the same grouping) rather
 * than a separate part of the app. */
export type SourceGroup = 'imported' | 'bot' | 'coached';

const SOURCE_GROUPS: Record<GameSource, SourceGroup> = {
  paste: 'imported',
  upload: 'imported',
  lichess: 'imported',
  chesscom: 'imported',
  vs_bot: 'bot',
  coach_play: 'coached'
};

export function sourceGroupFor(source: GameSource): SourceGroup {
  return SOURCE_GROUPS[source];
}

const SOURCE_GROUP_LABELS: Record<SourceGroup, string> = {
  imported: 'Imported',
  bot: 'Bot',
  coached: 'Coached'
};

const RESULT_LABEL: Record<string, { symbol: string; label: string }> = {
  '1-0': { symbol: '1–0', label: 'win' },
  '0-1': { symbol: '0–1', label: 'loss' },
  '1/2-1/2': { symbol: '½–½', label: 'draw' }
};

export interface StatusAndAction {
  statusLabel: string;
  statusVariant: 'primary' | 'warning' | 'danger' | 'neutral';
  animateStatus?: boolean;
  actionLabel?: string;
  /** Which callback the action button invokes — defaults to 'select'
   * (existing "Continue" behavior). 'analyze' starts analysis instead of
   * jumping into a coaching session (Phase 31's stat-bank addition).
   * 'reviewCoach' means there is no single action label at all: the row
   * renders both the Review and Coach buttons instead of one contextual
   * one — see GameRow's render. */
  actionKind?: 'select' | 'analyze' | 'reviewCoach';
}

/** design-improvements.md §3.3: status (what state the game is in) and
 * action (what the student can do next) are shown as two separate elements,
 * never combined into one label like "ready — start session". Exported so
 * GamesPage can filter rows by the same categories it renders.
 * architecture §14: a coach_play game never gets an `analyses` row, so its
 * analysisStatus is always null — it needs its own branch rather than
 * falling into the stat-bank "not analyzed" branch below, which is only for
 * a real analyze-mode game that was imported with `deferAnalysis`. */
export function statusAndActionFor(game: GameListItem): StatusAndAction {
  if (game.source === 'coach_play') {
    if (game.sessionId) return { statusLabel: 'In progress', statusVariant: 'primary', actionLabel: 'Continue' };
    return { statusLabel: 'Completed', statusVariant: 'neutral' };
  }
  if (game.source === 'vs_bot') {
    if (game.sessionId) return { statusLabel: 'In progress', statusVariant: 'primary', actionLabel: 'Continue' };
    // Unlike coach_play, a finished vs_bot game DOES get the standard-depth
    // post-game analysis job (bot-finalize.ts's finalizeBotGame queues it the
    // instant the game ends) — so a completed row still falls through to the
    // same ready/not-analyzed/analyzing handling below as a stat-bank import,
    // just skipping the "Completed" -> in-progress row above.
    if (game.analysisStatus === null) {
      return { statusLabel: 'Completed', statusVariant: 'neutral', actionLabel: 'Get coach analysis', actionKind: 'analyze' };
    }
    if (game.analysisStatus === 'ready') return { statusLabel: 'Completed', statusVariant: 'neutral', actionKind: 'reviewCoach' };
    if (game.analysisStatus === 'failed') return { statusLabel: 'Completed', statusVariant: 'neutral' };
    if (game.analysisStatus === 'paused') return PAUSED_STATUS;
    return { statusLabel: 'Analyzing…', statusVariant: 'neutral', animateStatus: true };
  }
  if (game.analysisStatus === 'ready') return { statusLabel: 'Ready', statusVariant: 'primary', actionKind: 'reviewCoach' };
  if (game.analysisStatus === 'failed') return { statusLabel: 'Failed', statusVariant: 'danger' };
  // Waiting on the user's own browser tunnel to reconnect (resolve-engine-
  // backend.ts's backgroundJob option, services/analysis.ts's markPaused) —
  // distinct from "Analyzing…" below, which would otherwise misleadingly
  // suggest it's actively making progress right now.
  if (game.analysisStatus === 'paused') return PAUSED_STATUS;
  // Phase 31 stat-bank import: no `analyses` row yet at all (deferAnalysis)
  // — distinct from every in-progress `analysisStatus` value below, which
  // falls through to the "Analyzing…" default.
  if (game.analysisStatus === null) {
    return { statusLabel: 'Not analyzed', statusVariant: 'neutral', actionLabel: 'Get coach analysis', actionKind: 'analyze' };
  }
  return { statusLabel: 'Analyzing…', statusVariant: 'neutral', animateStatus: true };
}

const PAUSED_STATUS: StatusAndAction = { statusLabel: 'Paused — reopen a tab to resume', statusVariant: 'warning' };

function userSideResult(game: GameListItem): { symbol: string; label: string } | null {
  if (!game.result) return null;
  const info = RESULT_LABEL[game.result];
  if (!info) return null;
  const userWasWhite = game.userColor === 'white';
  if (game.result === '1/2-1/2') return info;
  const userWon = (userWasWhite && game.result === '1-0') || (!userWasWhite && game.result === '0-1');
  return userWon ? { symbol: info.symbol, label: 'win' } : { symbol: info.symbol, label: 'loss' };
}

/** One consistent card for every game regardless of source (Daniel's IA
 * feedback: imported, bot, and coached games are all the same thing — a
 * game — with the same two things to do with it, source is just a metadata
 * label). A ready game always offers both Review and Coach side by side;
 * every other status keeps its single contextual action (Continue / Get
 * coach analysis / nothing) — see statusAndActionFor. Delete lives in an
 * overflow menu behind a confirmation dialog naming the game (§6, P0). */
export function GameRow({ game, onSelect, onReview, onCoach, onAnalyze, onExportPgn, onCopyPgn, onDelete }: GameRowProps): ReactNode {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const status = statusAndActionFor(game);
  const dot = userSideResult(game);
  const date = game.playedAt ?? game.createdAt;
  const [whiteName, blackName] = [game.whiteName ?? '?', game.blackName ?? '?'];
  const userIsWhite = game.userColor === 'white';

  return (
    <li className="game-row">
      <div className="game-row__top">
        <span className="game-row__players">
          <span className={userIsWhite ? 'game-row__you' : undefined}>{whiteName}</span>
          <span className="game-row__vs">vs</span>
          <span className={!userIsWhite ? 'game-row__you' : undefined}>{blackName}</span>
        </span>
        {dot && (
          <span className={`badge game-row__result game-row__result--${dot.label}`} title={dot.label}>
            {dot.symbol}
          </span>
        )}
        <OverflowMenu
          label={`More actions for ${whiteName} vs. ${blackName}`}
          items={[
            { label: 'Download PGN', onSelect: () => onExportPgn(game.id) },
            { label: 'Copy PGN', onSelect: () => onCopyPgn(game.id) },
            { label: 'Delete', destructive: true, onSelect: () => setConfirmingDelete(true) }
          ]}
        />
      </div>

      <span className="game-row__meta">
        {SOURCE_GROUP_LABELS[sourceGroupFor(game.source)]}
        <span aria-hidden="true">&middot;</span>
        <CalendarIcon width={13} height={13} />
        <time dateTime={date}>{new Date(date).toLocaleDateString()}</time>
        {game.timeControl && <span>&middot; {game.timeControl}</span>}
      </span>

      <div className="game-row__footer">
        <span
          className={
            status.statusVariant === 'neutral'
              ? 'badge game-row__status'
              : `badge badge--${status.statusVariant} game-row__status`
          }
          data-animate={status.animateStatus ? 'true' : undefined}
        >
          {status.statusLabel}
        </span>

        {status.actionKind === 'reviewCoach' ? (
          <div className="game-row__actions">
            <button type="button" className="btn-secondary game-row__action" onClick={() => onReview(game.id)}>
              <EyeIcon width={16} height={16} />
              Review
            </button>
            <button type="button" className="btn-primary game-row__action" onClick={() => onCoach(game.id)}>
              <MessageCircleIcon width={16} height={16} />
              Coach
            </button>
          </div>
        ) : (
          status.actionLabel && (
            <button
              type="button"
              className="btn-primary game-row__action"
              onClick={() => (status.actionKind === 'analyze' ? onAnalyze(game.id) : onSelect(game.id))}
            >
              {status.actionLabel}
            </button>
          )
        )}
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this game?"
          description={
            <p>
              Deleting <strong>{whiteName} vs. {blackName}</strong> also deletes its analysis and any coaching
              sessions. This cannot be undone.
            </p>
          }
          confirmLabel="Delete game"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            onDelete(game.id);
          }}
        />
      )}
    </li>
  );
}

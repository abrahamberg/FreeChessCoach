import type { GameListItem } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { CalendarIcon } from '../../components/Icon.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { OverflowMenu } from '../../components/OverflowMenu.js';
import './GameRow.css';

export interface GameRowProps {
  game: GameListItem;
  onSelect: (gameId: string) => void;
  onAnalyze: (gameId: string) => void;
  onDelete: (gameId: string) => void;
}

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
   * (existing "Start session"/"Continue" behavior). 'analyze' is Phase 31's
   * stat-bank addition: a deferred-analysis import's action starts analysis
   * instead of jumping into a coaching session. */
  actionKind?: 'select' | 'analyze';
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
  if (game.source === 'coach_play' || game.source === 'vs_bot') {
    if (game.sessionId) return { statusLabel: 'In progress', statusVariant: 'primary', actionLabel: 'Continue' };
    return { statusLabel: 'Completed', statusVariant: 'neutral' };
  }
  if (game.analysisStatus === 'ready') return { statusLabel: 'Ready', statusVariant: 'primary', actionLabel: 'Start session' };
  if (game.analysisStatus === 'failed') return { statusLabel: 'Failed', statusVariant: 'danger' };
  // Phase 31 stat-bank import: no `analyses` row yet at all (deferAnalysis)
  // — distinct from every in-progress `analysisStatus` value below, which
  // falls through to the "Analyzing…" default.
  if (game.analysisStatus === null) {
    return { statusLabel: 'Not analyzed', statusVariant: 'neutral', actionLabel: 'Get coach analysis', actionKind: 'analyze' };
  }
  return { statusLabel: 'Analyzing…', statusVariant: 'neutral', animateStatus: true };
}

function userSideResult(game: GameListItem): { symbol: string; label: string } | null {
  if (!game.result) return null;
  const info = RESULT_LABEL[game.result];
  if (!info) return null;
  const userWasWhite = game.userColor === 'white';
  if (game.result === '1/2-1/2') return info;
  const userWon = (userWasWhite && game.result === '1-0') || (!userWasWhite && game.result === '0-1');
  return userWon ? { symbol: info.symbol, label: 'win' } : { symbol: info.symbol, label: 'loss' };
}

/** design-improvements.md §3.3: a Games (home) list row — players + result
 * (user's side bold, W/L/D dot), date, time control, a status badge separate
 * from its contextual action button, and delete moved into an overflow menu
 * behind a confirmation dialog naming the game (§6, P0). */
export function GameRow({ game, onSelect, onAnalyze, onDelete }: GameRowProps): ReactNode {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const status = statusAndActionFor(game);
  const dot = userSideResult(game);
  const date = game.playedAt ?? game.createdAt;
  const [whiteName, blackName] = [game.whiteName ?? '?', game.blackName ?? '?'];
  const userIsWhite = game.userColor === 'white';

  return (
    <li className="game-row">
      <div className="game-row__identity">
        <span className="game-row__text">
          <span className="game-row__players">
            <span className={userIsWhite ? 'game-row__you' : undefined}>{whiteName}</span>
            <span className="game-row__vs">vs</span>
            <span className={!userIsWhite ? 'game-row__you' : undefined}>{blackName}</span>
            {dot && (
              <span className={`badge game-row__result game-row__result--${dot.label}`} title={dot.label}>
                {dot.symbol}
              </span>
            )}
          </span>
          <span className="game-row__meta">
            <CalendarIcon width={13} height={13} />
            <time dateTime={date}>{new Date(date).toLocaleDateString()}</time>
            {game.timeControl && <span>&middot; {game.timeControl}</span>}
          </span>
        </span>
      </div>

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

      {status.actionLabel && (
        <button
          type="button"
          className="btn-primary game-row__action"
          onClick={() => (status.actionKind === 'analyze' ? onAnalyze(game.id) : onSelect(game.id))}
        >
          {status.actionLabel}
        </button>
      )}

      <OverflowMenu
        label={`More actions for ${whiteName} vs. ${blackName}`}
        items={[{ label: 'Delete', destructive: true, onSelect: () => setConfirmingDelete(true) }]}
      />

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

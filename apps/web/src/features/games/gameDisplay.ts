import type { GameListItem, GameSource } from '@freechesscoach/shared';

/** What a game's source is called on a card — the Games page only lists
 * importable games now, so the real origin (Lichess, Chess.com, ...) is more
 * useful than the old Imported/Bot/Coached grouping. */
const SOURCE_LABELS: Record<GameSource, string> = {
  paste: 'Pasted',
  upload: 'Uploaded',
  lichess: 'Lichess',
  chesscom: 'Chess.com',
  vs_bot: 'Bot',
  coach_play: 'Coached'
};

export function sourceLabelFor(source: GameSource): string {
  return SOURCE_LABELS[source];
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

export function userSideResult(game: GameListItem): { symbol: string; label: string } | null {
  if (!game.result) return null;
  const info = RESULT_LABEL[game.result];
  if (!info) return null;
  const userWasWhite = game.userColor === 'white';
  if (game.result === '1/2-1/2') return info;
  const userWon = (userWasWhite && game.result === '1-0') || (!userWasWhite && game.result === '0-1');
  return userWon ? { symbol: info.symbol, label: 'win' } : { symbol: info.symbol, label: 'loss' };
}

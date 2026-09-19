import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ChesscomRecentGamesResponseSchema,
  LichessRecentGamesResponseSchema,
  UserProfileSchema
} from '@freechesscoach/shared';
import { apiGet, apiPatch, ApiError } from '../../api/client.js';
import { IMPORT_QUOTA_QUERY_KEY } from '../../hooks/useImportQuota.js';
import { importForStatBank } from './bulkImport.js';
import type { RemoteTab } from './RemoteImportPanel.js';

/** Everything the "From Lichess" / "From Chess.com" tabs need beyond the
 * single-game import: the two recent-games queries, the bulk-selection state
 * and bulk-import mutation, and the "set your username" prompt. ImportPage
 * composes this with its own single-game flow (AGENTS.md rule 7: fetching
 * lives in hooks). `tab` is whichever import tab is open. */
export function useRemoteImport(tab: string, onBatchFullyImported: () => void) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [importedIds, setImportedIds] = useState<ReadonlySet<string>>(new Set());
  const [dismissedUsernamePrompts, setDismissedUsernamePrompts] = useState<ReadonlySet<RemoteTab>>(new Set());

  // No AnalysisProgress/coaching-session hand-off here — that's specific to
  // the single-game "Analyze game" flow. A fully-successful batch goes
  // straight back to the Games list, where the new rows show "Analyzing…"
  // (each one's own engine pass is already queued — see importForStatBank);
  // a partial failure stays on this page so the remaining-count message (10
  // games/day limit) isn't shown and immediately lost.
  const bulkImportMutation = useMutation({
    mutationFn: importForStatBank,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: IMPORT_QUOTA_QUERY_KEY });
      if (result.succeeded === result.total) onBatchFullyImported();
    }
  });

  const lichessQuery = useQuery({
    queryKey: ['lichess-recent-games'],
    queryFn: ({ signal }) => apiGet('/api/lichess/recent-games', LichessRecentGamesResponseSchema, signal),
    enabled: tab === 'lichess'
  });
  const lichessNotLinked = lichessQuery.error instanceof ApiError && lichessQuery.error.status === 404;

  const chesscomQuery = useQuery({
    queryKey: ['chesscom-recent-games'],
    queryFn: ({ signal }) => apiGet('/api/chesscom/recent-games', ChesscomRecentGamesResponseSchema, signal),
    enabled: tab === 'chesscom'
  });
  const chesscomNotLinked = chesscomQuery.error instanceof ApiError && chesscomQuery.error.status === 404;

  function dismissUsernamePrompt(forTab: RemoteTab): void {
    setDismissedUsernamePrompts((current) => new Set(current).add(forTab));
  }

  // Same PATCH /api/users/me save SettingsPage's PlatformUsernameForm already
  // uses (Task: quick-set username from mid-import instead of detouring to
  // Settings) — dismissing here just hides the popup; the refetch is what
  // actually clears `*NotLinked` once the save lands.
  const lichessUsernameMutation = useMutation({
    mutationFn: (lichessUsername: string) => apiPatch('/api/users/me', { lichessUsername }, UserProfileSchema),
    onSuccess: () => {
      dismissUsernamePrompt('lichess');
      void lichessQuery.refetch();
    }
  });
  const chesscomUsernameMutation = useMutation({
    mutationFn: (chesscomUsername: string) => apiPatch('/api/users/me', { chesscomUsername }, UserProfileSchema),
    onSuccess: () => {
      dismissUsernamePrompt('chesscom');
      void chesscomQuery.refetch();
    }
  });

  // Which remote tab (if any) should be interrupted by the "set your
  // username" popup right now: only the tab actually open, only once its
  // 404 has come back, and only if the student hasn't already dismissed it
  // this visit (the tab's own linkPrompt text stays underneath as a
  // fallback route to Settings).
  const usernamePromptTab: RemoteTab | null =
    tab === 'lichess' && lichessNotLinked && !dismissedUsernamePrompts.has('lichess')
      ? 'lichess'
      : tab === 'chesscom' && chesscomNotLinked && !dismissedUsernamePrompts.has('chesscom')
        ? 'chesscom'
        : null;

  function saveUsernameForTab(forTab: RemoteTab, username: string): void {
    if (forTab === 'lichess') lichessUsernameMutation.mutate(username);
    else chesscomUsernameMutation.mutate(username);
  }

  /** Bulk-import selection is one shared Set for whichever remote tab is
   * active — clear it on every tab switch so a selection made against one
   * platform's game ids (e.g. Lichess) can't leak into the other tab's
   * import (Chess.com), where those ids almost never match. */
  function clearSelection(): void {
    setSelectedIds(new Set());
    setImportedIds(new Set());
  }

  function toggleSelection(remoteGameId: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(remoteGameId)) next.delete(remoteGameId);
      else next.add(remoteGameId);
      return next;
    });
  }

  /** Only meaningful while `tab` is a remote tab — the stat-bank checkbox is
   * only rendered for those tabs, so this is only ever called then. */
  function importSelected(): void {
    const games = tab === 'chesscom' ? chesscomQuery.data : lichessQuery.data;
    const selected = (games ?? [])
      .filter((game) => selectedIds.has(game.id))
      .map((game) => ({ id: game.id, pgn: game.pgn, playedAt: game.playedAt }));
    setImportedIds(new Set());
    bulkImportMutation.mutate({
      games: selected,
      source: tab as RemoteTab,
      onGameSettled: (settledId) => setImportedIds((current) => new Set(current).add(settledId))
    });
  }

  return {
    lichess: { games: lichessQuery.data ?? [], isLoading: lichessQuery.isLoading, isLinked: !lichessNotLinked },
    chesscom: { games: chesscomQuery.data ?? [], isLoading: chesscomQuery.isLoading, isLinked: !chesscomNotLinked },
    bulkSelection: { selectedIds, onToggle: toggleSelection, onImportSelected: importSelected, isImporting: bulkImportMutation.isPending, importedIds },
    bulkResult: bulkImportMutation.isSuccess ? bulkImportMutation.data : undefined,
    clearSelection,
    usernamePromptTab,
    saveUsernameForTab,
    dismissUsernamePrompt
  };
}

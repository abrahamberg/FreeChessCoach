import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ChesscomRecentGamesResponseSchema,
  LichessRecentGamesResponseSchema,
  UserProfileSchema
} from '@freechesscoach/shared';
import { apiGet, apiPatch, ApiError } from '../../api/client.js';
import { useProfile } from '../../hooks/useProfile.js';
import { IMPORT_QUOTA_QUERY_KEY } from '../../hooks/useImportQuota.js';
import { importBatch } from './bulkImport.js';
import type { RemoteTab } from './RemoteImportPanel.js';

const REMOTE_PAGE_SIZE = 20;

function recentGamesUrl(platform: 'lichess' | 'chesscom', before: string): string {
  const base = `/api/${platform}/recent-games`;
  return before ? `${base}?before=${encodeURIComponent(before)}` : base;
}

/** The next page starts where this one's oldest game ended; a short page
 * means the account has no more. */
function nextCursor(lastPage: { playedAt: string | null }[]): string | undefined {
  return lastPage.length >= REMOTE_PAGE_SIZE ? (lastPage.at(-1)?.playedAt ?? undefined) : undefined;
}

/** Everything the "From Lichess" / "From Chess.com" tabs need beyond the
 * single-game import: the two recent-games queries, the bulk-selection state
 * and bulk-import mutation, and the "set your username" prompt. ImportPage
 * composes this with its own single-game flow (AGENTS.md rule 7: fetching
 * lives in hooks). `tab` is whichever import tab is open. */
export function useRemoteImport(tab: string) {
  const queryClient = useQueryClient();
  const profileQuery = useProfile();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [importedIds, setImportedIds] = useState<ReadonlySet<string>>(new Set());
  const [changingUsernameFor, setChangingUsernameFor] = useState<RemoteTab | null>(null);
  const [dismissedUsernamePrompts, setDismissedUsernamePrompts] = useState<ReadonlySet<RemoteTab>>(new Set());

  // A batch stays on this page (BatchImportView) to follow its games'
  // analysis and offer the most tactical one for coaching; a batch where
  // nothing imported stays on the picker with the reason.
  const bulkImportMutation = useMutation({
    mutationFn: importBatch,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: IMPORT_QUOTA_QUERY_KEY });
    }
  });

  const lichessQuery = useInfiniteQuery({
    queryKey: ['lichess-recent-games'],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      apiGet(recentGamesUrl('lichess', pageParam), LichessRecentGamesResponseSchema, signal),
    getNextPageParam: nextCursor,
    enabled: tab === 'lichess'
  });
  const lichessGames = lichessQuery.data?.pages.flat() ?? [];
  const lichessNotLinked = lichessQuery.error instanceof ApiError && lichessQuery.error.status === 404;

  const chesscomQuery = useInfiniteQuery({
    queryKey: ['chesscom-recent-games'],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      apiGet(recentGamesUrl('chesscom', pageParam), ChesscomRecentGamesResponseSchema, signal),
    getNextPageParam: nextCursor,
    enabled: tab === 'chesscom'
  });
  const chesscomGames = chesscomQuery.data?.pages.flat() ?? [];
  const chesscomNotLinked = chesscomQuery.error instanceof ApiError && chesscomQuery.error.status === 404;

  function dismissUsernamePrompt(forTab: RemoteTab): void {
    setDismissedUsernamePrompts((current) => new Set(current).add(forTab));
  }

  /** A new username means a different account's games: drop the loaded pages
   * (and refresh the profile the picker reads the name from) instead of
   * appending to them. */
  function usernameSaved(forTab: RemoteTab): void {
    dismissUsernamePrompt(forTab);
    setChangingUsernameFor(null);
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
    void queryClient.resetQueries({ queryKey: [`${forTab}-recent-games`] });
  }

  // Same PATCH /api/users/me save SettingsPage's PlatformUsernameForm already
  // uses (Task: quick-set username from mid-import instead of detouring to
  // Settings) — dismissing here just hides the popup; the refetch is what
  // actually clears `*NotLinked` once the save lands.
  const lichessUsernameMutation = useMutation({
    mutationFn: (lichessUsername: string) => apiPatch('/api/users/me', { lichessUsername }, UserProfileSchema),
    onSuccess: () => usernameSaved('lichess')
  });
  const chesscomUsernameMutation = useMutation({
    mutationFn: (chesscomUsername: string) => apiPatch('/api/users/me', { chesscomUsername }, UserProfileSchema),
    onSuccess: () => usernameSaved('chesscom')
  });

  // Which remote tab (if any) should be interrupted by the "set your
  // username" popup right now: only the tab actually open, only once its
  // 404 has come back, and only if the student hasn't already dismissed it
  // this visit (the tab's own linkPrompt text stays underneath as a
  // fallback route to Settings).
  const usernamePromptTab: RemoteTab | null =
    changingUsernameFor === tab
      ? changingUsernameFor
      : tab === 'lichess' && lichessNotLinked && !dismissedUsernamePrompts.has('lichess')
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
    const games = tab === 'chesscom' ? chesscomGames : lichessGames;
    const selected = games
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
    lichess: {
      games: lichessGames,
      isLoading: lichessQuery.isLoading,
      isLinked: !lichessNotLinked,
      username: profileQuery.data?.lichessUsername ?? null,
      hasMore: lichessQuery.hasNextPage,
      isLoadingMore: lichessQuery.isFetchingNextPage,
      onLoadMore: () => void lichessQuery.fetchNextPage()
    },
    chesscom: {
      games: chesscomGames,
      isLoading: chesscomQuery.isLoading,
      isLinked: !chesscomNotLinked,
      username: profileQuery.data?.chesscomUsername ?? null,
      hasMore: chesscomQuery.hasNextPage,
      isLoadingMore: chesscomQuery.isFetchingNextPage,
      onLoadMore: () => void chesscomQuery.fetchNextPage()
    },
    bulkSelection: {
      selectedIds,
      onToggle: toggleSelection,
      onImportSelected: importSelected,
      isImporting: bulkImportMutation.isPending,
      importedIds
    },
    bulkResult: bulkImportMutation.isSuccess ? bulkImportMutation.data : undefined,
    clearSelection,
    /** Back from the batch view to the picker, ready for another batch. */
    clearBatch: () => {
      bulkImportMutation.reset();
      clearSelection();
    },
    usernamePromptTab,
    isChangingUsername: changingUsernameFor !== null,
    saveUsernameForTab,
    dismissUsernamePrompt: (forTab: RemoteTab) => {
      dismissUsernamePrompt(forTab);
      setChangingUsernameFor(null);
    },
    /** Opens the username popup for a name that is set but looks wrong. */
    changeUsername: (forTab: RemoteTab) => setChangingUsernameFor(forTab)
  };
}

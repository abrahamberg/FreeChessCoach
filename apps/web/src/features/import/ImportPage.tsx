import { parsePgn } from '@freechesscoach/chess-analysis';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import {
  ChesscomRecentGamesResponseSchema,
  ImportGameRequestSchema,
  ImportGameResponseSchema,
  LichessRecentGamesResponseSchema,
  type ImportGameRequest,
  type PlayerColor
} from '@freechesscoach/shared';
import { apiGet, apiPost, ApiError } from '../../api/client.js';
import { useAnalysisStatus } from '../../hooks/useAnalysisStatus.js';
import { AnalysisProgress } from './AnalysisProgress.js';
import { ColorConfirm } from './ColorConfirm.js';
import { ImportErrorNotice } from './ImportErrorNotice.js';
import { PgnPasteForm } from './PgnPasteForm.js';
import { PgnUploadForm } from './PgnUploadForm.js';
import { RemoteImportPanel, type BulkResult, type RemoteTab } from './RemoteImportPanel.js';
import './ImportPage.css';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function finalFenOf(pgn: string): string {
  return fensOf(pgn).at(-1) ?? START_FEN;
}

/** The denominator for the engine step's percentage. The API reports how many
 * positions it has analyzed, not how many there are, because the client
 * already holds the PGN — so the total is derived here rather than shipped. */
function positionCountOf(pgn: string): number {
  return fensOf(pgn).length;
}

/** Every position's FEN, index-aligned with ply — lets AnalysisProgress show
 * the position currently being analyzed instead of just the final one. */
function fensOf(pgn: string): string[] {
  try {
    return parsePgn(pgn).positions.map((position) => position.fen);
  } catch {
    return [];
  }
}

const SessionSummarySchema = z.object({ id: z.string() });
type ImportTab = 'paste' | 'upload' | RemoteTab;

interface BulkImportArgs {
  pgns: string[];
  source: RemoteTab;
}

/** Stat-bank bulk import (Task 31.4): imports each selected game, one request
 * per game (the API has no batch import endpoint), tolerating individual
 * failures so one rate-limited or malformed game doesn't lose the rest of
 * the batch. Shared by both remote pickers (Lichess, Chess.com) since the
 * only per-source difference is the `source` tag on the request body.
 *
 * No `deferAnalysis` here (unlike the on-demand `/api/games/:id/analyze`
 * re-analyze path GameRow's "Get coach analysis" button still uses for
 * older, already-deferred rows) — engine analysis has no AI/BYOK-unlock
 * dependency (services/analysis.ts), so there's no cost left to defer by
 * making the student click into every row by hand; every bulk-imported game
 * gets the same free engine pass a single-game import already does. */
async function importForStatBank({ pgns, source }: BulkImportArgs): Promise<BulkResult> {
  let succeeded = 0;
  let rateLimited = false;
  for (const pgn of pgns) {
    try {
      const body = ImportGameRequestSchema.parse({ pgn, source });
      await apiPost('/api/games', body, ImportGameResponseSchema);
      succeeded += 1;
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) rateLimited = true;
    }
  }
  return { succeeded, total: pgns.length, rateLimited };
}

/** Import a game, watch its analysis (SSE), and hand off into a coaching
 * session once it's ready. Composes PgnPasteForm + ColorConfirm; no fetching
 * lives in either presentational child (AGENTS.md rule 7). */
export function ImportPage(): ReactNode {
  const navigate = useNavigate();
  const [pendingPgn, setPendingPgn] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [tab, setTab] = useState<ImportTab>('paste');
  const [statBankMode, setStatBankMode] = useState(false);
  const [selectedRemoteIds, setSelectedRemoteIds] = useState<ReadonlySet<string>>(new Set());

  const importMutation = useMutation({
    mutationFn: (body: ImportGameRequest) => apiPost('/api/games', body, ImportGameResponseSchema),
    onSuccess: (data) => {
      setGameId(data.gameId);
      setAnalysisId(data.analysisId);
    }
  });

  const sessionMutation = useMutation({
    mutationFn: (forGameId: string) => apiPost('/api/sessions', { gameId: forGameId }, SessionSummarySchema),
    onSuccess: (session) => navigate(`/session/${session.id}`)
  });

  // No AnalysisProgress/coaching-session hand-off here — that's specific to
  // the single-game "Analyze game" flow above. A fully-successful batch goes
  // straight back to the Games list, where the new rows show "Analyzing…"
  // (each one's own engine pass is already queued — see importForStatBank);
  // a partial failure stays on this page so the remaining-count message (10
  // games/day limit) isn't shown and immediately lost.
  const bulkImportMutation = useMutation({
    mutationFn: importForStatBank,
    onSuccess: (result) => {
      if (result.succeeded === result.total) void navigate('/games');
    }
  });

  /** Bulk-import selection is one shared Set for whichever remote tab is
   * active — clear it on every switch so a selection made against one
   * platform's game ids (e.g. Lichess) can't leak into the other tab's
   * import (Chess.com), where those ids almost never match. */
  function switchTab(next: ImportTab): void {
    setTab(next);
    setSelectedRemoteIds(new Set());
  }

  function toggleRemoteSelection(remoteGameId: string): void {
    setSelectedRemoteIds((current) => {
      const next = new Set(current);
      if (next.has(remoteGameId)) next.delete(remoteGameId);
      else next.add(remoteGameId);
      return next;
    });
  }

  /** Only meaningful while `tab` is a RemoteTab — the stat-bank checkbox is
   * only rendered for those tabs, so this is only ever called then. */
  function importSelectedForStatBank(): void {
    const games = tab === 'chesscom' ? chesscomQuery.data : lichessQuery.data;
    const pgns = (games ?? []).filter((game) => selectedRemoteIds.has(game.id)).map((game) => game.pgn);
    bulkImportMutation.mutate({ pgns, source: tab as RemoteTab });
  }

  const { status, analyzedPositions, error: analysisError } = useAnalysisStatus(analysisId);

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

  useEffect(() => {
    if (status === 'ready' && gameId && !sessionMutation.isPending && !sessionMutation.isSuccess) {
      sessionMutation.mutate(gameId);
    }
  }, [status, gameId, sessionMutation]);

  const missingColor =
    importMutation.error instanceof ApiError &&
    importMutation.error.status === 422 &&
    (importMutation.error.body as { missing?: string } | undefined)?.missing === 'userColor';

  // Every import failure that ISN'T the 422 "which colour were you?" prompt
  // (ColorConfirm handles that one below). Without this the mutation's error
  // state rendered nothing at all, so a rate-limited import — 429 "Import limit
  // reached (10 games/day)" — looked exactly like a dead button: press it, and
  // the page just sits there.
  const importError = missingColor ? null : importMutation.error;

  function importPgn(pgn: string, source: ImportGameRequest['source'] = 'paste', userColor?: PlayerColor): void {
    const body = ImportGameRequestSchema.parse({ pgn, source, userColor });
    setPendingPgn(pgn);
    importMutation.mutate(body);
  }

  function retry(): void {
    setGameId(null);
    setAnalysisId(null);
    importMutation.reset();
  }

  if (gameId && analysisId) {
    return (
      <div className="page import-page">
        <h1>Import a game</h1>
        <AnalysisProgress
          status={status}
          finalFen={finalFenOf(pendingPgn ?? '')}
          onRetry={retry}
          error={analysisError}
          analyzedPositions={analyzedPositions}
          totalPositions={positionCountOf(pendingPgn ?? '')}
          positions={fensOf(pendingPgn ?? '')}
        />
      </div>
    );
  }

  return (
    <div className="page import-page">
      <h1>Import a game</h1>
      {missingColor && pendingPgn ? (
        <ColorConfirm onConfirm={(color) => importPgn(pendingPgn, 'paste', color)} />
      ) : (
        <>
          {importError && <ImportErrorNotice error={importError} />}
          <div role="tablist">
            <button type="button" aria-pressed={tab === 'paste'} onClick={() => switchTab('paste')}>
              Paste
            </button>
            <button type="button" aria-pressed={tab === 'upload'} onClick={() => switchTab('upload')}>
              Upload
            </button>
            <button type="button" aria-pressed={tab === 'lichess'} onClick={() => switchTab('lichess')}>
              From Lichess
            </button>
            <button type="button" aria-pressed={tab === 'chesscom'} onClick={() => switchTab('chesscom')}>
              From Chess.com
            </button>
          </div>
          {tab === 'paste' && <PgnPasteForm onSubmit={(body) => importPgn(body.pgn, body.source, body.userColor)} />}
          {tab === 'upload' && <PgnUploadForm onSubmit={(body) => importPgn(body.pgn, body.source)} />}
          {(tab === 'lichess' || tab === 'chesscom') && (
            <RemoteImportPanel
              tab={tab}
              statBankMode={statBankMode}
              onStatBankModeChange={setStatBankMode}
              lichess={{ games: lichessQuery.data ?? [], isLoading: lichessQuery.isLoading, isLinked: !lichessNotLinked }}
              chesscom={{ games: chesscomQuery.data ?? [], isLoading: chesscomQuery.isLoading, isLinked: !chesscomNotLinked }}
              onSelect={(pgn) => importPgn(pgn, tab)}
              bulkSelection={{
                selectedIds: selectedRemoteIds,
                onToggle: toggleRemoteSelection,
                onImportSelected: importSelectedForStatBank,
                isImporting: bulkImportMutation.isPending
              }}
              bulkResult={bulkImportMutation.isSuccess ? bulkImportMutation.data : undefined}
            />
          )}
        </>
      )}
    </div>
  );
}

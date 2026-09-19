import { parsePgn } from '@freechesscoach/chess-analysis';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import {
  ImportGameRequestSchema,
  ImportGameResponseSchema,
  type ImportGameRequest,
  type PlayerColor
} from '@freechesscoach/shared';
import { apiPost, ApiError } from '../../api/client.js';
import { useAnalysisStatus } from '../../hooks/useAnalysisStatus.js';
import { IMPORT_QUOTA_QUERY_KEY, useImportQuota } from '../../hooks/useImportQuota.js';
import { AnalysisProgress } from './AnalysisProgress.js';
import { ColorConfirm } from './ColorConfirm.js';
import { selectionLimit } from './import-limit-copy.js';
import { ImportErrorNotice } from './ImportErrorNotice.js';
import { PgnPasteForm } from './PgnPasteForm.js';
import { PgnUploadForm } from './PgnUploadForm.js';
import { RemoteImportPanel, type RemoteTab } from './RemoteImportPanel.js';
import { useRemoteImport } from './useRemoteImport.js';
import { UsernamePromptModal } from './UsernamePromptModal.js';
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
const IMPORT_TABS: ImportTab[] = ['paste', 'upload', 'lichess', 'chesscom'];

/** Games page's "Import games" shortcuts (Task) link straight into a
 * specific tab (`/import?tab=lichess`) instead of always landing on Paste —
 * falls back to Paste for a missing/unrecognized value rather than
 * crashing on a hand-typed or stale URL. */
function importTabFromSearchParams(params: URLSearchParams): ImportTab {
  const requested = params.get('tab');
  return IMPORT_TABS.find((tab) => tab === requested) ?? 'paste';
}

/** Import a game, watch its analysis (SSE), and hand off into a coaching
 * session once it's ready. Composes PgnPasteForm + ColorConfirm; no fetching
 * lives in either presentational child (AGENTS.md rule 7). */
export function ImportPage(): ReactNode {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const quotaQuery = useImportQuota();
  const [searchParams] = useSearchParams();
  const [pendingPgn, setPendingPgn] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [tab, setTab] = useState<ImportTab>(() => importTabFromSearchParams(searchParams));
  const [statBankMode, setStatBankMode] = useState(false);

  const importMutation = useMutation({
    mutationFn: (body: ImportGameRequest) => apiPost('/api/games', body, ImportGameResponseSchema),
    onSuccess: (data) => {
      setGameId(data.gameId);
      setAnalysisId(data.analysisId);
      void queryClient.invalidateQueries({ queryKey: IMPORT_QUOTA_QUERY_KEY });
    }
  });

  const sessionMutation = useMutation({
    mutationFn: (forGameId: string) => apiPost('/api/sessions', { gameId: forGameId }, SessionSummarySchema),
    onSuccess: (session) => navigate(`/session/${session.id}`)
  });

  const remote = useRemoteImport(tab, () => void navigate('/games'));
  const promptTab = remote.usernamePromptTab;

  function switchTab(next: ImportTab): void {
    setTab(next);
    remote.clearSelection();
  }

  const { status, analyzedPositions, error: analysisError } = useAnalysisStatus(analysisId);

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
  // reached (30 games/day)" — looked exactly like a dead button: press it, and
  // the page just sits there.
  const importError = missingColor ? null : importMutation.error;

  function importPgn(
    pgn: string,
    source: ImportGameRequest['source'] = 'paste',
    userColor?: PlayerColor,
    playedAt?: string | null
  ): void {
    const body = ImportGameRequestSchema.parse({ pgn, source, userColor, playedAt });
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
              lichess={remote.lichess}
              chesscom={remote.chesscom}
              onSelect={(pgn, playedAt) => importPgn(pgn, tab, undefined, playedAt)}
              bulkSelection={{ ...remote.bulkSelection, ...selectionLimit(quotaQuery.data) }}
              bulkResult={remote.bulkResult}
            />
          )}
          {promptTab && (
            <UsernamePromptModal
              tab={promptTab}
              onSave={(username) => remote.saveUsernameForTab(promptTab, username)}
              onClose={() => remote.dismissUsernamePrompt(promptTab)}
            />
          )}
        </>
      )}
    </div>
  );
}

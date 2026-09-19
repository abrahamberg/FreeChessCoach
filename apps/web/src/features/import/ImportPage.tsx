import { parsePgn } from '@freechesscoach/chess-analysis';
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useImportQuota } from '../../hooks/useImportQuota.js';
import { AiSetupRequiredModal } from '../settings/AiSetupRequiredModal.js';
import { AnalysisProgress } from './AnalysisProgress.js';
import { useAutoDeleteNotice } from './AutoDeleteNotice.js';
import { BatchImportView } from './BatchImportView.js';
import { ColorConfirm } from './ColorConfirm.js';
import { selectionLimit } from './import-limit-copy.js';
import { ImportErrorNotice } from './ImportErrorNotice.js';
import { PgnPasteForm } from './PgnPasteForm.js';
import { PgnUploadForm } from './PgnUploadForm.js';
import { RemoteImportPanel, type RemoteTab } from './RemoteImportPanel.js';
import { UsernamePromptModal } from './UsernamePromptModal.js';
import { useRemoteImport } from './useRemoteImport.js';
import { useSingleImport } from './useSingleImport.js';
import './ImportPage.css';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Every position's FEN, index-aligned with ply — lets AnalysisProgress show
 * the position currently being analyzed instead of just the final one. Also
 * the denominator for the engine step's percentage: the API reports how many
 * positions it has analyzed, not how many there are, because the client
 * already holds the PGN. */
function fensOf(pgn: string): string[] {
  try {
    return parsePgn(pgn).positions.map((position) => position.fen);
  } catch {
    return [];
  }
}

type ImportTab = 'paste' | 'upload' | RemoteTab;
const IMPORT_TABS: { tab: ImportTab; label: string }[] = [
  { tab: 'paste', label: 'Paste' },
  { tab: 'upload', label: 'Upload' },
  { tab: 'lichess', label: 'From Lichess' },
  { tab: 'chesscom', label: 'From Chess.com' }
];

/** Games page's "Import games" shortcuts link straight into a specific tab
 * (`/import?tab=lichess`) instead of always landing on Paste — falls back to
 * Paste for a missing/unrecognized value rather than crashing on a
 * hand-typed or stale URL. */
function importTabFromSearchParams(params: URLSearchParams): ImportTab {
  const requested = params.get('tab');
  return IMPORT_TABS.find(({ tab }) => tab === requested)?.tab ?? 'paste';
}

/** Import a game, watch its analysis (SSE), and hand off to the review or a
 * coaching session — whichever button the reader pressed. Composes the
 * forms and pickers; fetching lives in `useSingleImport`/`useRemoteImport`
 * (AGENTS.md rule 7). An import that would push the library past its cap is
 * held behind the auto-delete notice first. */
export function ImportPage(): ReactNode {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<ImportTab>(() => importTabFromSearchParams(searchParams));
  const [bulkMode, setBulkMode] = useState(false);
  const quotaQuery = useImportQuota();
  const autoDelete = useAutoDeleteNotice(quotaQuery.data);
  const single = useSingleImport();
  const remote = useRemoteImport(tab);
  const promptTab = remote.usernamePromptTab;

  function switchTab(next: ImportTab): void {
    setTab(next);
    remote.clearSelection();
  }

  if (remote.bulkResult && remote.bulkResult.games.length > 0) {
    return <BatchImportView result={remote.bulkResult} onImportMore={remote.clearBatch} />;
  }

  if (single.progress) {
    const positions = fensOf(single.progress.pgn);
    return (
      <div className="page import-page">
        <h1>Import a game</h1>
        <AnalysisProgress
          status={single.progress.status}
          finalFen={positions.at(-1) ?? START_FEN}
          onRetry={single.retry}
          error={single.progress.error}
          analyzedPositions={single.progress.analyzedPositions}
          totalPositions={positions.length}
          positions={positions}
        />
        {single.errorMessages.map((message) => (
          <p key={message}>{message}</p>
        ))}
        {single.aiSetupPrompt && (
          <AiSetupRequiredModal
            onClose={single.aiSetupPrompt.onClose}
            onGoToSettings={single.aiSetupPrompt.onGoToSettings}
            onAnalyzeInstead={single.aiSetupPrompt.onAnalyzeInstead}
          />
        )}
      </div>
    );
  }

  return (
    <div className="page import-page">
      <h1>Import a game</h1>
      {single.needsColor ? (
        <ColorConfirm onConfirm={single.confirmColor} />
      ) : (
        <>
          {single.importError && <ImportErrorNotice error={single.importError} />}
          <div role="tablist">
            {IMPORT_TABS.map(({ tab: candidate, label }) => (
              <button key={candidate} type="button" aria-pressed={tab === candidate} onClick={() => switchTab(candidate)}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'paste' && (
            <PgnPasteForm
              onSubmit={(body, intent) => autoDelete.guard(1, () => single.start({ pgn: body.pgn, source: body.source, userColor: body.userColor }, intent))}
            />
          )}
          {tab === 'upload' && (
            <PgnUploadForm onSubmit={(body, intent) => autoDelete.guard(1, () => single.start({ pgn: body.pgn, source: body.source }, intent))} />
          )}
          {(tab === 'lichess' || tab === 'chesscom') && (
            <RemoteImportPanel
              tab={tab}
              bulkMode={bulkMode}
              onBulkModeChange={setBulkMode}
              lichess={remote.lichess}
              chesscom={remote.chesscom}
              onSelect={(pgn, playedAt, intent) => autoDelete.guard(1, () => single.start({ pgn, source: tab, playedAt }, intent))}
              bulkSelection={{
                ...remote.bulkSelection,
                ...selectionLimit(quotaQuery.data),
                onImportSelected: () => autoDelete.guard(remote.bulkSelection.selectedIds.size, remote.bulkSelection.onImportSelected)
              }}
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
          {autoDelete.notice}
        </>
      )}
    </div>
  );
}

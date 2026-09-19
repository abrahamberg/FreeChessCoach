import { ImportGameRequestSchema, ImportGameResponseSchema, type ImportGameRequest, type PlayerColor } from '@freechesscoach/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiPost } from '../../api/client.js';
import { useAnalysisStatus } from '../../hooks/useAnalysisStatus.js';
import { IMPORT_QUOTA_QUERY_KEY } from '../../hooks/useImportQuota.js';
import { useGameActions } from '../games/useGameActions.js';
import type { ImportIntent } from './import-intent.js';
import { useImportedGame } from './useImportedGame.js';

/** One game the reader chose to import, kept whole so the "which colour were
 * you?" round-trip re-sends exactly what was first sent — same source, date
 * and intent — with only the colour added. */
export interface SingleImportRequest {
  pgn: string;
  source: ImportGameRequest['source'];
  playedAt?: string | null;
  userColor?: PlayerColor;
}

/** Import one game, watch its analysis (SSE), and — when it is ready — take
 * the reader to what they asked for: the review, or a coaching session
 * (through `useGameActions.handleCoach`, so the no-AI-setup prompt and its
 * "Analyze instead" fallback still apply). Nothing navigates before `ready`. */
export function useSingleImport() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<{ request: SingleImportRequest; intent: ImportIntent } | null>(null);
  const [imported, setImported] = useState<{ gameId: string; analysisId: string | null } | null>(null);
  const handedOff = useRef(false);

  const importMutation = useMutation({
    mutationFn: (request: SingleImportRequest) =>
      apiPost('/api/games', ImportGameRequestSchema.parse(request), ImportGameResponseSchema),
    onSuccess: (data) => {
      handedOff.current = false;
      setImported(data);
      void queryClient.invalidateQueries({ queryKey: IMPORT_QUOTA_QUERY_KEY });
    }
  });

  const analysis = useAnalysisStatus(imported?.analysisId ?? null);
  const isReady = analysis.status === 'ready';
  const intent = pending?.intent ?? null;

  // The game's tier is only needed to start a coaching session (a duplicate
  // may already be promoted), so it is fetched only for that intent.
  const coachGame = useImportedGame(isReady && intent === 'coach' ? (imported?.gameId ?? null) : null);
  const actions = useGameActions(coachGame.data ? [coachGame.data] : []);

  useEffect(() => {
    if (!isReady || !imported || handedOff.current) return;
    if (intent === 'review') {
      handedOff.current = true;
      void navigate(`/review/${imported.gameId}`);
    } else if (intent === 'coach' && coachGame.data) {
      handedOff.current = true;
      actions.handleCoach(imported.gameId);
    }
  }, [isReady, imported, intent, coachGame.data, actions, navigate]);

  const missingColor =
    importMutation.error instanceof ApiError &&
    importMutation.error.status === 422 &&
    (importMutation.error.body as { missing?: string } | undefined)?.missing === 'userColor';

  function start(request: SingleImportRequest, chosenIntent: ImportIntent): void {
    setPending({ request, intent: chosenIntent });
    importMutation.mutate(request);
  }

  function confirmColor(userColor: PlayerColor): void {
    if (pending) importMutation.mutate({ ...pending.request, userColor });
  }

  function retry(): void {
    setImported(null);
    importMutation.reset();
  }

  return {
    start,
    confirmColor,
    retry,
    /** The 422 "which colour were you?" answer is needed. */
    needsColor: missingColor && pending !== null,
    /** Every import failure except the colour prompt, which ColorConfirm answers. */
    importError: missingColor ? null : importMutation.error,
    /** Set once the game is imported and its analysis is being watched. */
    progress: imported && imported.analysisId ? { pgn: pending?.request.pgn ?? '', ...analysis } : null,
    aiSetupPrompt: actions.aiSetupPrompt,
    errorMessages: actions.errorMessages
  };
}

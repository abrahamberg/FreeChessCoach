import type { ParsedPosition } from '@freechesscoach/chess-analysis';
import type { CoachPersona } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { ExploreNoteCard } from '../board/ExploreNoteCard.js';
import type { UseExploreFeedbackResult } from '../board/useExploreFeedback.js';
import type { ArrowRef } from '../chat/arrowToken.js';
import { ChatComposer } from '../chat/ChatComposer.js';
import '../chat/ChatPane.css';
import type { HoverMove } from '../chat/MessageList.js';
import { PagedMessageCard } from '../chat/PagedMessageCard.js';
import type { UseMessagePagingResult } from '../chat/useMessagePaging.js';
import type { UseCoachVoiceResult } from '../../hooks/useCoachVoice.js';
import { StackedSessionBody } from './StackedSessionBody.js';

export interface MobileCoachSessionBodyProps {
  board: ReactNode;
  messagePaging: UseMessagePagingResult;
  fen: string;
  positions: ParsedPosition[];
  onSelectPly: (ply: number) => void;
  onHoverMove: (move: HoverMove) => void;
  coachPersona: CoachPersona;
  displayName?: string;
  ttsEnabled: boolean;
  coachVoice: UseCoachVoiceResult;
  isThinking: boolean;
  thinkingLabel: string | null;
  activeToolName: string | null;
  onSend: (content: string) => void;
  boardArrows: ArrowRef[];
  hasPendingLine: boolean;
  /** "Explore on your own" (SessionPage/SessionBoardColumn) — while true,
   * this screen's one "coach box" slot shows ExploreNoteCard's own
   * off-the-record take on the sandbox instead of the real transcript, same
   * as BotStatusPanel already stands in for it during a bot game. Reverts to
   * PagedMessageCard automatically once the student leaves peek mode
   * (isExploring flips back to false — see SessionPage's own effect). */
  isExploring: boolean;
  exploreFeedback: UseExploreFeedbackResult;
}

/** SessionPage's own mobile layout — the exact same structure
 * GameReviewPage's mobile Review page landed on (now shared as
 * StackedSessionBody): one card above (there, the current move's note;
 * here, PagedMessageCard showing one transcript entry at a time, paging
 * left/right via its own header's MessageNavPills rather than a scrolling
 * list of stacked messages — see PagedMessageCard's own doc comment), the
 * board edge-to-edge below it — see SessionPage.css's `.stacked` block for
 * the full reasoning. Extracted from SessionPage.tsx purely to keep that
 * file under the repo's file-length guideline (AGENTS.md) — this has no
 * fetching of its own. ChatComposer is pinned to the bottom of the screen
 * rather than part of the stack (no GameReviewPage equivalent — a read-only
 * review has no reply), always open — iMessage-style, not a button that
 * reveals the field — so its keyboard only ever appears once the student
 * actually taps in to type, covering the board beneath it rather than the
 * conversation above.
 *
 * There used to be a dedicated header row above the card (a portrait +
 * persona name, the voice toggle) — dropped: PagedMessageCard already shows
 * the same portrait in its own header, so a separate row was a second,
 * larger copy of an identity the student can already see, costing a whole
 * row the board could use instead. The voice autoplay toggle now lives in
 * SessionHeader's overflow menu (SessionPage), alongside Settings/the
 * engine indicator — otherwise unreachable on a board route (AppShell hides
 * its own top bar there) — rather than a per-card button. */
export function MobileCoachSessionBody({
  board,
  messagePaging,
  fen,
  positions,
  onSelectPly,
  onHoverMove,
  coachPersona,
  displayName,
  ttsEnabled,
  coachVoice,
  isThinking,
  thinkingLabel,
  activeToolName,
  onSend,
  boardArrows,
  hasPendingLine,
  isExploring,
  exploreFeedback
}: MobileCoachSessionBodyProps): ReactNode {
  return (
    <StackedSessionBody
      card={
        isExploring ? (
          <ExploreNoteCard status={exploreFeedback.status} evaluation={exploreFeedback.evaluation} note={exploreFeedback.note} />
        ) : (
          <PagedMessageCard
            messagePaging={messagePaging}
            fen={fen}
            positions={positions}
            onSelectPly={onSelectPly}
            onHoverMove={onHoverMove}
            coachPersona={coachPersona}
            displayName={displayName}
            onPlayMessage={ttsEnabled ? coachVoice.play : undefined}
            onStopMessage={ttsEnabled ? coachVoice.stop : undefined}
            playingMessageId={coachVoice.playingMessageId}
            loadingMessageId={coachVoice.loadingMessageId}
            isThinking={isThinking}
            thinkingLabel={thinkingLabel}
            activeToolName={activeToolName}
          />
        )
      }
      board={board}
      footer={<ChatComposer onSend={onSend} boardArrows={boardArrows} hasPendingLine={hasPendingLine} />}
    />
  );
}

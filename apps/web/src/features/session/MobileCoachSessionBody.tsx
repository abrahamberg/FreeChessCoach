import type { ParsedPosition } from '@freechesscoach/chess-analysis';
import type { CoachPersona } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import type { ArrowRef } from '../chat/arrowToken.js';
import { ChatComposer } from '../chat/ChatComposer.js';
import type { HoverMove } from '../chat/MessageList.js';
import { MessageNavPills } from '../chat/MessageNavPills.js';
import { PagedMessageCard } from '../chat/PagedMessageCard.js';
import { ThinkingIndicator } from '../chat/ThinkingIndicator.js';
import { ToolActivity } from '../chat/ToolActivity.js';
import type { UseMessagePagingResult } from '../chat/useMessagePaging.js';
import type { UseCoachVoiceResult } from '../../hooks/useCoachVoice.js';

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
  activeToolName: string | null;
  onSend: (content: string) => void;
  boardArrows: ArrowRef[];
  hasPendingLine: boolean;
}

/** SessionPage's own mobile layout — the exact same structure
 * GameReviewPage's mobile Review page landed on: one card above (there, the
 * current move's note; here, PagedMessageCard showing one transcript entry
 * at a time, paged left/right via MessageNavPills — not a scrolling list of
 * stacked messages), the board edge-to-edge below it, nav pills below the
 * board — see SessionPage.css's `.stacked` block for the full reasoning.
 * Extracted from SessionPage.tsx purely to keep that file under the
 * repo's file-length guideline (AGENTS.md) — this has no fetching of its
 * own, same as the old MobileSessionBody it replaces. ChatComposer is
 * pinned to the bottom of the screen rather than part of the stack (no
 * GameReviewPage equivalent — a read-only review has no reply), always
 * open — iMessage-style, not a button that reveals the field — so its
 * keyboard only ever appears once the student actually taps in to type,
 * covering the board beneath it rather than the conversation above. */
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
  activeToolName,
  onSend,
  boardArrows,
  hasPendingLine
}: MobileCoachSessionBodyProps): ReactNode {
  return (
    <div className="session-body mobile stacked">
      <PagedMessageCard
        message={messagePaging.current}
        index={messagePaging.index}
        visible={messagePaging.visible}
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
      />
      <ThinkingIndicator visible={isThinking} />
      <ToolActivity toolName={activeToolName} />
      {board}
      <MessageNavPills index={messagePaging.index} total={messagePaging.total} onSelect={messagePaging.goTo} />
      <div className="session-composer-fixed">
        <ChatComposer onSend={onSend} boardArrows={boardArrows} hasPendingLine={hasPendingLine} />
      </div>
    </div>
  );
}

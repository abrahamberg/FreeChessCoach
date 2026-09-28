import { useEffect, useState, type ReactNode } from 'react';
import { useTurnDebugSnapshot, type DebugMessage, type DebugTurnView, type TurnDebugSnapshot } from './useTurnDebugSnapshot.js';
import { DebugCallPicker } from './DebugCallPicker.js';
import { DebugPanelContent } from './DebugPanelContent.js';
import './DebugPanel.css';

export interface DebugPanelProps {
  sessionId: string;
  /** API collection the session lives under; practice sessions use '/api/puzzle-sessions'. */
  basePath?: string;
  onClose: () => void;
}

/** "Debug last answer" popup: the literal request sent to the LLM and the
 * literal response it returned, rendered as a readable console/network-
 * inspector-style view instead of raw JSON. Opens on the newest turn; the
 * picker (shared with the course view) steps back through the last few. */
export function DebugPanel({ sessionId, basePath, onClose }: DebugPanelProps): ReactNode {
  const state = useTurnDebugSnapshot(sessionId, basePath);
  const [copied, setCopied] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const turns = state.status === 'ready' ? state.turns : [];
  const index = picked ?? turns.length - 1;
  const turn = turns[index];

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleCopy(snapshot: TurnDebugSnapshot): Promise<void> {
    await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const picker = turns.length > 1 && (
    <DebugCallPicker
      items={turns.map((each, position) => ({ key: `${each.at ?? 'latest'}-${position}`, label: turnLabel(each) }))}
      index={index}
      label="Coach turns"
      onPick={setPicked}
    />
  );

  return (
    <div className="debug-panel-backdrop" onClick={onClose}>
      <div
        className="debug-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Coach turn debug"
        onClick={(event) => event.stopPropagation()}
      >
        {state.status === 'loading' && <div className="debug-panel__status">Loading…</div>}
        {state.status === 'error' && <div className="debug-panel__status">{state.message}</div>}
        {turn && !turn.snapshot && (
          <>
            {picker}
            <div className="debug-panel__status">This turn was logged in an older format.</div>
          </>
        )}
        {turn?.snapshot && (
          <DebugPanelContent
            snapshot={turn.snapshot}
            context={`session ${sessionId.slice(0, 4)}…${sessionId.slice(-4)}${turns.length > 1 ? ` · turn ${index + 1} of ${turns.length}` : ''}`}
            copied={copied}
            onCopy={handleCopy}
            onClose={onClose}
          >
            {picker}
          </DebugPanelContent>
        )}
      </div>
    </div>
  );
}

/** The picker's name for a turn: what the student said, else the time. */
function turnLabel(turn: DebugTurnView): string {
  const time = turn.at ? new Date(turn.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'latest';
  const said = turn.snapshot ? lastUserText(turn.snapshot.request.messages as DebugMessage[]) : '';
  return said ? `${time} · ${said.length > 28 ? `${said.slice(0, 27)}…` : said}` : time;
}

function lastUserText(messages: DebugMessage[]): string {
  const user = [...messages].reverse().find((message) => message.role === 'user');
  if (!user) return '';
  if (typeof user.content === 'string') return user.content.trim();
  if (!Array.isArray(user.content)) return '';
  const part = (user.content as unknown[]).find((each): each is { type: 'text'; text: string } => {
    const candidate = each as { type?: unknown; text?: unknown };
    return candidate.type === 'text' && typeof candidate.text === 'string';
  });
  return part?.text.trim() ?? '';
}

import { useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { ArrowRightIcon } from '../components/Icon.js';
import type { DemoConversation } from './demoConversation.js';
import './demo.css';

export interface DemoComposerProps {
  conversation: DemoConversation;
  onSend: (content: string) => void;
}

/** The reply box in the demo: the student's next line is already written and
 * cannot be edited. The visitor presses send, sees the coach think, then the
 * scripted answer arrives, exactly as with a real model. */
export function DemoComposer({ conversation, onSend }: DemoComposerProps): ReactNode {
  const { nextLine, busy } = useSyncExternalStore(conversation.subscribe.bind(conversation), () => conversation.state());

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (nextLine && !busy) onSend(nextLine);
  }

  if (nextLine === null) return <DemoEnd />;
  return (
    <form className="chat-composer demo-composer" onSubmit={handleSubmit}>
      <div className="chip-reply-input demo-composer__input" data-busy={busy}>
        <input aria-label="Your reply (pre-written for the demo)" value={busy ? '' : nextLine} readOnly placeholder="…" />
      </div>
      <button type="submit" className="chat-composer__send" aria-label="Send message" disabled={busy}>
        <ArrowRightIcon width={18} height={18} />
      </button>
      <p className="demo-composer__hint">Demo: your reply is pre-written. Press send to see how the coach answers.</p>
    </form>
  );
}

function DemoEnd(): ReactNode {
  return (
    <div className="chat-composer demo-composer demo-composer--end">
      <p className="demo-composer__hint">
        That is the end of the demo conversation. <a href="/oauth2/start?rd=/games">Sign in</a> to coach your own games, or{' '}
        <a href="/tour">read the tour</a>.
      </p>
    </div>
  );
}

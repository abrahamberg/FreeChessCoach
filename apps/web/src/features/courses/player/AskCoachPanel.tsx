import { COACH_PERSONA_INFO } from '@freechesscoach/shared';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CoachAvatar } from '../../../components/CoachAvatar.js';
import { CloseIcon } from '../../../components/Icon.js';
import { useProfile } from '../../../hooks/useProfile.js';
import { useUnlockLlmSetup } from '../../../hooks/useUnlockLlmSetup.js';
import { AiSetupRequiredModal } from '../../settings/AiSetupRequiredModal.js';
import { UnlockPhraseModal } from '../../settings/UnlockPhraseModal.js';
import { useCourseCoachChat, type CourseQuestionPosition } from './useCourseCoachChat.js';

export interface AskCoachPanelProps {
  position: CourseQuestionPosition;
}

/**
 * docs/courses.md §11: "Ask my coach" beside a course position, for a
 * signed-in learner. Their own coach answers, shown with their own coach's
 * avatar and name in a panel of its own, apart from the course coach's card.
 * It is told the course line and notes, and the engine wins over the course.
 */
export function AskCoachPanel({ position }: AskCoachPanelProps): ReactNode {
  const profile = useProfile();
  const unlock = useUnlockLlmSetup();
  const [popup, setPopup] = useState<'unlock' | 'setup' | null>(null);
  const retryRef = useRef<(() => Promise<void>) | null>(null);
  // The same popups as the other coach pages: unlock here and the question
  // is asked again; no setup at all goes to Settings.
  const chat = useCourseCoachChat(position, {
    onUnlockRequired: (retry) => {
      retryRef.current = retry;
      setPopup('unlock');
    },
    onSetupRequired: () => setPopup('setup')
  });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const persona = profile.data?.coachPersona ?? 'general';
  const coach = COACH_PERSONA_INFO[persona].label;

  if (!open) {
    return (
      <button type="button" className="btn-secondary ask-coach__open" onClick={() => setOpen(true)}>
        <CoachAvatar persona={persona} size="chat" />
        <span>
          Ask my coach<span className="ask-coach__open-more"> about this move</span>
        </span>
      </button>
    );
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const question = draft.trim();
    if (!question || chat.isStreaming) return;
    setDraft('');
    void chat.ask(question);
  };

  return (
    <section className="ask-coach" aria-label="Ask my coach">
      <header className="ask-coach__header">
        <CoachAvatar persona={persona} size="chat" />
        <div>
          <p className="ask-coach__title">{coach === 'Coach' ? 'Your coach' : `Your coach: ${coach}`}</p>
          <p className="meta">Checks the course against the engine; where they disagree, the engine wins.</p>
        </div>
        <button type="button" className="ask-coach__close" aria-label="Close" title="Close" onClick={() => setOpen(false)}>
          <CloseIcon width={16} height={16} />
        </button>
      </header>
      {chat.messages.length > 0 && (
        <ol className="ask-coach__messages" aria-live="polite">
          {chat.messages.map((message) => (
            <li key={message.id} className={message.role === 'user' ? 'ask-coach__message ask-coach__message--you' : 'ask-coach__message'}>
              {message.text || <span className="meta">Thinking…</span>}
            </li>
          ))}
        </ol>
      )}
      {popup === 'unlock' && (
        <UnlockPhraseModal
          description="Your coach needs your AI setup unlocked to answer."
          onClose={() => {
            setPopup(null);
            unlock.reset();
          }}
          onUnlock={unlock.unlock}
          onUnlocked={() => {
            setPopup(null);
            unlock.reset();
            const retry = retryRef.current;
            retryRef.current = null;
            void retry?.();
          }}
          isPending={unlock.isPending}
          isSuccess={unlock.isSuccess}
          errorMessage={unlock.errorMessage}
        />
      )}
      {popup === 'setup' && (
        <AiSetupRequiredModal
          onClose={() => setPopup(null)}
          onGoToSettings={() => {
            window.location.href = '/settings#settings-api-keys';
          }}
        />
      )}
      <form className="ask-coach__form" onSubmit={submit}>
        <textarea
          value={draft}
          rows={2}
          maxLength={2000}
          placeholder="Why this move? What if I play …?"
          aria-label="Your question"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) submit(event);
          }}
        />
        <button type="submit" className="btn-primary" disabled={!draft.trim() || chat.isStreaming}>
          Ask
        </button>
      </form>
    </section>
  );
}

/** §11 for a signed-out visitor: the same button, and a box saying coaching
 * needs an account. Sign-in comes back to this course (oauth2-proxy's `rd`). */
export function AskCoachSignIn(): ReactNode {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn-secondary ask-coach__open" onClick={() => setOpen(true)}>
        <CoachAvatar persona="general" size="chat" />
        <span>
          Ask my coach<span className="ask-coach__open-more"> about this move</span>
        </span>
      </button>
    );
  }
  const back = `${window.location.pathname}${window.location.search}`;
  return (
    <section className="ask-coach" aria-label="Ask my coach">
      <header className="ask-coach__header">
        <CoachAvatar persona="general" size="chat" />
        <div>
          <p className="ask-coach__title">Ask your own coach</p>
          <p className="meta">To use coaching you need to sign in. Your coach then answers your questions about any move in this course.</p>
        </div>
      </header>
      <div className="course-player__actions">
        <a className="btn-primary" href={`/oauth2/start?rd=${encodeURIComponent(back)}`}>
          Sign in
        </a>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Not now
        </button>
      </div>
    </section>
  );
}

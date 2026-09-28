import { COACH_PERSONA_INFO } from '@freechesscoach/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { CoachAvatar } from '../../../components/CoachAvatar.js';
import { useProfile } from '../../../hooks/useProfile.js';
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
  const chat = useCourseCoachChat(position);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const persona = profile.data?.coachPersona ?? 'general';
  const coach = COACH_PERSONA_INFO[persona].label;

  if (!open) {
    return (
      <button type="button" className="btn-secondary ask-coach__open" onClick={() => setOpen(true)}>
        <CoachAvatar persona={persona} size="chat" />
        Ask my coach about this move
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
      {chat.needsSettings && (
        <p className="meta">
          Your coach needs your AI setup: <a href="/settings">open Settings</a>.
        </p>
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

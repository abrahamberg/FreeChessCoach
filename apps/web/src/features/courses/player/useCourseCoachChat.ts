import { useCallback, useEffect, useRef, useState } from 'react';
import { noteRateLimit } from '../../../api/rate-limit-notice.js';
import { readCoachStream, readProblemDetailTitle } from '../../../hooks/coachStream.js';
import type { CoachMessage } from '../../../hooks/useCoachChat.js';

/** Which course position the conversation is about. */
export interface CourseQuestionPosition {
  slug: string;
  episodeId: string;
  /** The board after this move; null before the episode's first move. */
  nodeId: string | null;
}

export interface CourseCoachChat {
  messages: CoachMessage[];
  isStreaming: boolean;
  /** "Set up your AI" or "unlock your AI setup": the answer is in Settings. */
  needsSettings: boolean;
  ask: (question: string) => Promise<void>;
}

/**
 * docs/courses.md §11: the learner's own coach on one course position. The
 * short conversation lives here and is sent whole each time (the server
 * stores nothing); it starts afresh when the position changes. Text only:
 * the coach's check_moves and engine calls run on the server.
 */
export function useCourseCoachChat(position: CourseQuestionPosition): CourseCoachChat {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [needsSettings, setNeedsSettings] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const { slug, episodeId, nodeId } = position;

  useEffect(() => {
    setMessages([]);
    return () => controllerRef.current?.abort();
  }, [slug, episodeId, nodeId]);

  const ask = useCallback(
    async (question: string) => {
      const history = [...messages.filter((message) => message.text.trim()), { id: crypto.randomUUID(), role: 'user' as const, text: question }];
      const assistantId = crypto.randomUUID();
      setMessages([...history, { id: assistantId, role: 'assistant', text: '' }]);
      const write = (text: string): void => setMessages((prev) => prev.map((message) => (message.id === assistantId ? { ...message, text } : message)));
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setIsStreaming(true);
      try {
        const response = await fetch('/api/course-questions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug, episodeId, nodeId, messages: history.slice(-24).map(({ role, text }) => ({ role, content: text })) }),
          signal: controller.signal
        });
        noteRateLimit(response);
        if (!response.ok || !response.body) {
          const reason = await readProblemDetailTitle(response);
          write(reason);
          if (response.status === 400 && /set up your ai|unlock your ai setup/i.test(reason)) setNeedsSettings(true);
          return;
        }
        let text = '';
        await readCoachStream(response.body, {
          onTextDelta: (delta) => {
            text += delta;
            write(text);
          },
          onError: (message) => {
            if (!text) write(message);
          },
          onToolCall: () => Promise.resolve()
        });
      } catch (error) {
        if (!controller.signal.aborted) write('Could not reach your coach. Try again in a moment.');
        else if (error instanceof Error && error.name !== 'AbortError') throw error;
      } finally {
        if (controllerRef.current === controller) setIsStreaming(false);
      }
    },
    [messages, slug, episodeId, nodeId]
  );

  return { messages, isStreaming, needsSettings, ask };
}

import type { ServerResponse } from 'node:http';
import { pipeUIMessageStreamToResponse, toUIMessageStream } from 'ai';
import type { CoachTurnStream } from './chat.js';
import { classifyLlmError } from './provider-error.js';

/**
 * Streams a coach turn to an already-hijacked Fastify raw response as
 * Server-Sent Events of UI message chunks (`text-delta`,
 * `tool-input-available`, ...), which is what apps/web's `readCoachStream`
 * parses. Keeps the HTTP encoding out of the route handler.
 */
export async function pipeCoachStreamToResponse(response: ServerResponse, turn: CoachTurnStream): Promise<void> {
  await pipeUIMessageStreamToResponse({
    response,
    stream: toUIMessageStream({
      stream: turn.stream,
      tools: turn.tools,
      // The coach is Socratic — it withholds answers on purpose, and its
      // thinking says exactly what the questioning is meant to draw out. So
      // reasoning never reaches the student's transcript. It is NOT lost:
      // `onFinish` still receives it on the assistant message, which is what
      // the debug snapshot stores and the debug popup renders.
      sendReasoning: false,
      onError: (error) => {
        const classified = classifyLlmError(error);
        console.error(`coach stream error [${classified.logSummary}]:`, error);
        // This text reaches the student verbatim (coachStream.ts's onError,
        // via the UI stream's `error` chunk) — it must say what to actually
        // go do (billing page, Settings, wait it out), not just fail generically.
        return classified.userMessage;
      }
    })
  });
}

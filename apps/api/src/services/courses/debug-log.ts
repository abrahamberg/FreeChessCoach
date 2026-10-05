import type { CourseDebugCall } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as courseAiCallsRepo from '../../db/repositories/course-ai-calls.js';
import type { Database } from '../../db/schema.js';
import type { ModelResolution } from '../../llm/gateway.js';
import { cachedHeadUserMessage, cachedSystemMessage } from '../../llm/messages.js';
import { generateStructured } from '../../llm/text.js';
import { singleCallTimings } from '../../llm/turn-timings.js';
import type { TurnUsage } from '../../llm/usage.js';
import type { TurnDebugSnapshot } from '../coach-agent-debug.js';
import type { CourseMessages } from '@freechesscoach/prompts';
import type { CourseCallLabel, CourseModelCall } from './generation-inputs.js';

export interface LoggedCourseCallOptions {
  db: Kysely<Database>;
  courseId: string;
  /** The creator's model, resolved per call (an expired unlock stops the run). */
  resolve: () => Promise<ModelResolution>;
  now?: () => number;
}

const NO_USAGE: TurnUsage = { freshInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: null, outputTokens: 0, reasoningTokens: 0 };

/**
 * Task 80.6: the course run's model call, with every call written to
 * `course_ai_calls` as it happens — as the same literal request/response
 * snapshot the coach chat's "Debug last answer" shows — and the checks'
 * problems added when `checked` hears them. A failed call is logged, then
 * rethrown.
 */
export function loggedCourseCall({ db, courseId, resolve, now = Date.now }: LoggedCourseCallOptions): CourseModelCall {
  const unchecked = new Map<string, { id: string; entry: CourseDebugCall }>();
  const key = (label: CourseCallLabel): string => `${label.step}:${label.episodeId ?? ''}:${String(label.repair)}`;

  const call = (async (messages, schema, label) => {
    const resolution = await resolve();
    const started = now();
    const record = (response: TurnDebugSnapshot['response'], error: string | null): CourseDebugCall => ({
      at: new Date(started).toISOString(),
      ...label,
      durationMs: now() - started,
      error,
      problems: null,
      snapshot: { request: request(resolution, messages), response } satisfies TurnDebugSnapshot
    });
    try {
      // Phase 101: every call of a run shares the system prompt, and the
      // episode calls the head of their user message: both are cached.
      const result = await generateStructured({ resolution, system: messages.system, prompt: messages.user, schema, cached: { head: messages.shared, tail: messages.retry } });
      const answer = { role: 'assistant', content: JSON.stringify(result.object, null, 2) };
      const entry = record(
        {
          messages: [answer],
          finishReason: result.finishReason,
          usage: result.usage,
          providerMetadata: result.providerMetadata,
          timings: singleCallTimings(now() - started, result.finishReason, result.usage.outputTokens)
        },
        null
      );
      unchecked.set(key(label), { id: await courseAiCallsRepo.insert(db, courseId, entry), entry });
      return result.object;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await courseAiCallsRepo.insert(db, courseId, record({ messages: [], finishReason: 'error', usage: NO_USAGE, providerMetadata: null, timings: singleCallTimings(now() - started, 'error', 0) }, message));
      throw error;
    }
  }) as CourseModelCall;

  call.checked = async (label, problems) => {
    const logged = unchecked.get(key(label));
    if (!logged) return;
    unchecked.delete(key(label));
    await courseAiCallsRepo.update(db, logged.id, { ...logged.entry, problems });
  };
  return call;
}

/** One structured call: the system prompt in the instructions slot, the
 * request as the one user message, no tools. */
function request(resolution: ModelResolution, messages: CourseMessages): TurnDebugSnapshot['request'] {
  return {
    provider: resolution.isLocal ? 'local' : resolution.provider,
    model: resolution.modelId,
    // As sent: the cached system prompt, and the user message's cached head.
    instructions: [cachedSystemMessage(messages.system)],
    messages: [messages.shared ? cachedHeadUserMessage(messages.shared, messages.user, messages.retry) : { role: 'user', content: messages.user }],
    tools: [],
    maxSteps: 1,
    reasoning: resolution.callOptions.reasoning,
    providerOptions: resolution.callOptions.providerOptions ?? null
  };
}

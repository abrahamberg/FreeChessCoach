import type { AssistantModelMessage, ModelMessage, SystemModelMessage, ToolModelMessage } from 'ai';

/** The app's name for a provider-bound chat message. Everything above `llm/`
 * uses these aliases so the AI SDK's own message types stay behind this
 * boundary (AGENTS.md rule 6) — a future SDK rename lands here alone. */
export type ChatMessage = ModelMessage;
export type SystemChatMessage = SystemModelMessage;

/** What a model call can produce. Narrower than `ChatMessage` on purpose: the
 * roles here line up exactly with `SessionMessageRole`, so every generated
 * message can be persisted to the append-only transcript without a cast. */
export type ResponseChatMessage = AssistantModelMessage | ToolModelMessage;

/**
 * A system block the provider is asked to cache (design doc §5). Anthropic
 * bills a cache write once and reads it back at a fraction of the price on
 * every later turn. OpenAI (GPT-5.6 and later) needs its own explicit
 * breakpoint: without one it places a single implicit breakpoint on the
 * latest message, so the cache only ever holds whole prompts and any change
 * inside a layer — a new move note, the current-move block — misses the
 * entire prefix even though the leading layers are byte-identical.
 *
 * Anthropic allows at most FOUR cache breakpoints per request — see
 * `buildEpisodeMessages` in services/coach-context.ts, which spends all four.
 * A fifth cached block cannot be added without dropping one of those, or the
 * request starts failing at the provider.
 */
export function cachedSystemMessage(content: string): SystemChatMessage {
  return {
    role: 'system',
    content,
    providerOptions: {
      anthropic: { cacheControl: { type: 'ephemeral' } },
      openai: { promptCacheBreakpoint: { mode: 'explicit' } }
    }
  };
}

export function systemMessage(content: string): SystemChatMessage {
  return { role: 'system', content };
}

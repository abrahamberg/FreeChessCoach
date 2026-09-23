import type {
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4Usage
} from '@ai-sdk/provider';

/** A local model answered, but with nothing usable (typically: it spent its
 * whole output budget thinking). The message is shown to the user. */
export class LocalModelEmptyAnswerError extends Error {
  constructor(finishReason: string | null) {
    super(
      finishReason === 'length'
        ? 'Your local model used its whole output budget thinking and gave no answer. Turn its thinking level down in Settings → AI (Advanced).'
        : 'Your local model returned an empty answer.'
    );
    this.name = 'LocalModelEmptyAnswerError';
  }
}

interface WireMessage {
  content?: unknown;
  reasoning_content?: unknown;
  reasoning?: unknown;
  tool_calls?: Array<{ id?: unknown; function?: { name?: unknown; arguments?: unknown } }>;
}

interface WireCompletion {
  choices?: Array<{ message?: WireMessage; finish_reason?: unknown }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; completion_tokens_details?: { reasoning_tokens?: unknown } };
}

export interface ParsedLocalCompletion {
  content: LanguageModelV4Content[];
  finishReason: LanguageModelV4FinishReason;
  usage: LanguageModelV4Usage;
}

/** Maps a non-streamed Chat Completions answer to AI SDK content. Thinking
 * comes either as `reasoning_content` / `reasoning` or inline as a leading
 * `<think>…</think>` block; both become a reasoning part. */
export function parseLocalCompletion(raw: unknown, expectJson: boolean): ParsedLocalCompletion {
  const completion = (typeof raw === 'object' && raw !== null ? raw : {}) as WireCompletion;
  const choice = completion.choices?.[0];
  const message = choice?.message ?? {};
  const finishRaw = typeof choice?.finish_reason === 'string' ? choice.finish_reason : null;
  const split = splitThinking(asString(message.content));
  const reasoning = [asString(message.reasoning_content) || asString(message.reasoning), split.reasoning].filter(Boolean).join('\n');
  const text = expectJson ? extractJsonText(split.text) : split.text;
  const toolCalls = (message.tool_calls ?? []).map((call, index) => ({
    type: 'tool-call' as const,
    toolCallId: asString(call.id) || `local-call-${index}`,
    toolName: asString(call.function?.name),
    input: asString(call.function?.arguments) || '{}'
  }));
  if (text.trim() === '' && toolCalls.length === 0) throw new LocalModelEmptyAnswerError(finishRaw);

  const content: LanguageModelV4Content[] = [];
  if (reasoning) content.push({ type: 'reasoning', text: reasoning });
  if (text) content.push({ type: 'text', text });
  content.push(...toolCalls);
  return { content, finishReason: mapFinishReason(finishRaw), usage: mapUsage(completion.usage) };
}

/** Splits a leading `<think>…</think>` block off the answer. Some chat
 * templates put the opening tag in the prompt, so a bare `</think>` also
 * ends the thinking. */
export function splitThinking(content: string): { reasoning: string; text: string } {
  const close = content.indexOf('</think>');
  if (close === -1) return { reasoning: '', text: content };
  const before = content.slice(0, close);
  const open = before.indexOf('<think>');
  if (open !== -1 && before.slice(0, open).trim() !== '') return { reasoning: '', text: content };
  const reasoning = (open === -1 ? before : before.slice(open + '<think>'.length)).trim();
  return { reasoning, text: content.slice(close + '</think>'.length).trimStart() };
}

/** A local server that ignores `response_format` may still wrap its JSON in
 * a code fence or a sentence; take the outermost object by matching braces
 * (skipping over ones inside string literals) rather than assuming the last
 * `}` in the text closes it — trailing prose can contain its own brace. */
export function extractJsonText(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text;
}

export function mapFinishReason(raw: string | null): LanguageModelV4FinishReason {
  const unified: LanguageModelV4FinishReason['unified'] =
    raw === 'stop' ? 'stop'
      : raw === 'length' ? 'length'
        : raw === 'tool_calls' || raw === 'function_call' ? 'tool-calls'
          : raw === 'content_filter' ? 'content-filter'
            : 'other';
  return { unified, raw: raw ?? undefined };
}

export function mapUsage(usage: WireCompletion['usage']): LanguageModelV4Usage {
  const input = asNumber(usage?.prompt_tokens);
  const output = asNumber(usage?.completion_tokens);
  const reasoning = asNumber(usage?.completion_tokens_details?.reasoning_tokens);
  return {
    inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: {
      total: output,
      text: output !== undefined && reasoning !== undefined ? output - reasoning : output,
      reasoning
    }
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

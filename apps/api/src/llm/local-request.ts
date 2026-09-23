import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Message,
  LanguageModelV4ToolChoice,
  LanguageModelV4ToolResultOutput
} from '@ai-sdk/provider';

/** One OpenAI Chat Completions message, as LM Studio / Ollama accept it. */
export type LocalChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: LocalToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

interface LocalToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface LocalChatBodyOptions {
  stream: boolean;
  /** False once a server has rejected `reasoning_effort` /
   * `chat_template_kwargs`; the thinking level is then left to the model. */
  sendThinkingControls: boolean;
}

/** Builds the OpenAI Chat Completions request a local server receives for
 * one AI SDK call: the whole conversation (including earlier tool calls and
 * their results), tools, the JSON schema for structured output, and the
 * thinking level. */
export function buildLocalChatBody(
  modelId: string,
  options: LanguageModelV4CallOptions,
  bodyOptions: LocalChatBodyOptions
): Record<string, unknown> {
  const tools = functionTools(options);
  return dropUndefined({
    model: modelId,
    messages: options.prompt.flatMap(toLocalMessages),
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? toLocalToolChoice(options.toolChoice) : undefined,
    response_format: toResponseFormat(options.responseFormat),
    max_tokens: options.maxOutputTokens,
    temperature: options.temperature,
    top_p: options.topP,
    stop: options.stopSequences,
    seed: options.seed,
    presence_penalty: options.presencePenalty,
    frequency_penalty: options.frequencyPenalty,
    ...(bodyOptions.sendThinkingControls ? thinkingControls(options.reasoning) : {}),
    stream: bodyOptions.stream,
    stream_options: bodyOptions.stream ? { include_usage: true } : undefined
  });
}

/** `none` also sets `enable_thinking: false` in the chat template, which is
 * what Qwen3-style models on llama.cpp-based servers read (they ignore
 * `reasoning_effort`); servers that don't know the key ignore it. */
function thinkingControls(reasoning: LanguageModelV4CallOptions['reasoning']): Record<string, unknown> {
  if (!reasoning || reasoning === 'provider-default') return {};
  if (reasoning === 'none') {
    return { reasoning_effort: 'none', chat_template_kwargs: { enable_thinking: false } };
  }
  const effort = reasoning === 'minimal' ? 'low' : reasoning === 'xhigh' ? 'high' : reasoning;
  return { reasoning_effort: effort };
}

function functionTools(options: LanguageModelV4CallOptions): unknown[] {
  return (options.tools ?? []).flatMap((tool) =>
    tool.type === 'function'
      ? [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }]
      : []
  );
}

function toLocalToolChoice(choice: LanguageModelV4ToolChoice | undefined): unknown {
  if (!choice) return undefined;
  if (choice.type === 'tool') return { type: 'function', function: { name: choice.toolName } };
  return choice.type;
}

function toResponseFormat(format: LanguageModelV4CallOptions['responseFormat']): unknown {
  if (format?.type !== 'json' || !format.schema) return undefined;
  return { type: 'json_schema', json_schema: { name: format.name ?? 'response', schema: format.schema, strict: true } };
}

function toLocalMessages(message: LanguageModelV4Message): LocalChatMessage[] {
  if (message.role === 'system') return [{ role: 'system', content: message.content }];
  if (message.role === 'user') return [{ role: 'user', content: joinText(message.content) }];
  if (message.role === 'assistant') return [toAssistantMessage(message.content)];
  return message.content.flatMap((part) =>
    part.type === 'tool-result' ? [{ role: 'tool' as const, tool_call_id: part.toolCallId, content: outputToText(part.output) }] : []
  );
}

type AssistantContent = Extract<LanguageModelV4Message, { role: 'assistant' }>['content'];

/** Reasoning parts are not sent back: chat templates drop earlier thinking,
 * and resending it only spends the local model's context. */
function toAssistantMessage(content: AssistantContent): LocalChatMessage {
  const text = joinText(content);
  const toolCalls: LocalToolCall[] = content.flatMap((part) =>
    part.type === 'tool-call'
      ? [{ id: part.toolCallId, type: 'function' as const, function: { name: part.toolName, arguments: toArguments(part.input) } }]
      : []
  );
  if (toolCalls.length === 0) return { role: 'assistant', content: text };
  return { role: 'assistant', content: text === '' ? null : text, tool_calls: toolCalls };
}

function joinText(parts: ReadonlyArray<{ type: string; text?: string }>): string {
  return parts.map((part) => (part.type === 'text' && part.text ? part.text : '')).join('');
}

function toArguments(input: unknown): string {
  return typeof input === 'string' ? input : JSON.stringify(input ?? {});
}

export function outputToText(output: LanguageModelV4ToolResultOutput): string {
  switch (output.type) {
    case 'text':
    case 'error-text':
      return output.value;
    case 'json':
    case 'error-json':
      return JSON.stringify(output.value);
    case 'execution-denied':
      return output.reason ? `Tool execution denied: ${output.reason}` : 'Tool execution denied';
    case 'content':
      return output.value.map((item) => (item.type === 'text' ? item.text : '')).join('');
  }
}

function dropUndefined(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
}

import { generateText, stepCountIs, type ToolSet } from 'ai';
import type { ModelResolution } from './gateway.js';
import { toTurnUsage, type TurnUsage } from './usage.js';

export interface AgentTextCallArgs {
  resolution: ModelResolution;
  system: string;
  prompt: string;
  tools: ToolSet;
  maxSteps: number;
}

export interface AgentTextResult {
  text: string;
  finishReason: string;
  usage: TurnUsage;
  stepCount: number;
}

/**
 * A bounded, non-streaming tool-calling loop — the light-tier counterpart to
 * `chat.ts`'s `runCoachTurn` (which is hard-wired to `streamText` and
 * Fastify's hijacked-response SSE plumbing, so not reusable here). Sibling to
 * this file's own `generateProse`/`generateStructured`, just with tools.
 * Forces a final text answer once the step budget is nearly exhausted,
 * rather than leaving the caller with a bare unanswered tool call.
 */
export async function runBoundedToolLoop(args: AgentTextCallArgs): Promise<AgentTextResult> {
  const result = await generateText({
    model: args.resolution.model,
    instructions: args.system,
    prompt: args.prompt,
    tools: args.tools,
    stopWhen: stepCountIs(args.maxSteps),
    prepareStep: ({ stepNumber }) => (stepNumber >= args.maxSteps - 1 ? { toolChoice: 'none' as const } : {}),
    ...args.resolution.callOptions
  });
  return { text: result.text, finishReason: result.finishReason, usage: toTurnUsage(result.usage), stepCount: result.steps.length };
}

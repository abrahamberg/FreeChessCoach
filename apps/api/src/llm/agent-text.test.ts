import { z } from 'zod';
import { describe, expect, test } from 'vitest';
import { mockResolution, multiStepGenerateModel } from '../../test/helpers/mock-model.js';
import { runBoundedToolLoop } from './agent-text.js';
import { tool, type ToolSet } from './tools.js';

function echoTools(): ToolSet {
  return {
    echo: tool({
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }: { value: string }) => ({ value })
    })
  };
}

describe('runBoundedToolLoop', () => {
  test('a single text step with no tool call returns that text', async () => {
    const model = multiStepGenerateModel([{ text: 'the answer is 4', finishReason: 'stop' }]);

    const result = await runBoundedToolLoop({
      resolution: mockResolution(model),
      system: 'system',
      prompt: 'what is 2+2?',
      tools: echoTools(),
      maxSteps: 4
    });

    expect(result.text).toBe('the answer is 4');
    expect(result.stepCount).toBe(1);
    expect(model.doGenerateCalls.length).toBe(1);
  });

  test('a tool call followed by a text step returns the final text, having run both steps', async () => {
    const model = multiStepGenerateModel([
      { toolCall: { toolCallId: 't1', toolName: 'echo', input: { value: 'hi' } }, finishReason: 'tool-calls' },
      { text: 'got hi back', finishReason: 'stop' }
    ]);

    const result = await runBoundedToolLoop({
      resolution: mockResolution(model),
      system: 'system',
      prompt: 'echo hi',
      tools: echoTools(),
      maxSteps: 4
    });

    expect(result.text).toBe('got hi back');
    expect(result.stepCount).toBe(2);
  });

  test('exhausting the step budget while the model keeps calling tools still forces a final text answer via toolChoice: none', async () => {
    const model = multiStepGenerateModel([
      { toolCall: { toolCallId: 't1', toolName: 'echo', input: { value: 'a' } }, finishReason: 'tool-calls' },
      { toolCall: { toolCallId: 't2', toolName: 'echo', input: { value: 'b' } }, finishReason: 'tool-calls' },
      { text: 'best conclusion so far', finishReason: 'stop' }
    ]);

    const result = await runBoundedToolLoop({
      resolution: mockResolution(model),
      system: 'system',
      prompt: 'echo a lot',
      tools: echoTools(),
      maxSteps: 3
    });

    expect(result.text).toBe('best conclusion so far');
    // The last of the 3 doGenerate calls (index 2, i.e. stepNumber 2, which
    // is >= maxSteps - 1 === 2) must have been forced toolChoice: 'none'.
    expect(model.doGenerateCalls.at(-1)?.toolChoice).toEqual({ type: 'none' });
  });

  test("a tool's execute throwing surfaces as a tool-error content part rather than crashing the loop — the model still gets a chance to answer (matches the AI SDK's own tool-error handling, not a rethrow)", async () => {
    const throwingTools: ToolSet = {
      boom: tool({
        inputSchema: z.object({}),
        execute: async (): Promise<{ ok: boolean }> => {
          throw new Error('tool exploded');
        }
      })
    };
    const model = multiStepGenerateModel([
      { toolCall: { toolCallId: 't1', toolName: 'boom', input: {} }, finishReason: 'tool-calls' },
      { text: 'could not check that, answering anyway', finishReason: 'stop' }
    ]);

    const result = await runBoundedToolLoop({
      resolution: mockResolution(model),
      system: 'system',
      prompt: 'go',
      tools: throwingTools,
      maxSteps: 4
    });

    expect(result.text).toBe('could not check that, answering anyway');
  });
});

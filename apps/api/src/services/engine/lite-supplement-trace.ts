import type { PositionAnalysis } from '@freechesscoach/shared';
import type { BotMoveDebugCollector } from './bot-move-debug.js';

/** How each main-engine bucket reads in the Thinking log. */
const MAIN_ENGINE_LABEL = {
  internal: 'server Stockfish',
  external: 'chess-api.com',
  browser: 'browser Stockfish'
} as const;

/** Runs the main engine call, recording it as a Thinking-log step when the
 * bot move being built is being traced; otherwise just runs it. */
export function traceMainEngineCall(
  debug: BotMoveDebugCollector | undefined,
  bucket: keyof typeof MAIN_ENGINE_LABEL,
  call: () => Promise<PositionAnalysis>
): Promise<PositionAnalysis> {
  if (!debug?.trace) return call();
  return debug.trace.run(`Main engine call (${MAIN_ENGINE_LABEL[bucket]})`, call, {
    describeResult: (result) => `${result.lines.length} lines returned`
  });
}

/** Opens the light-supplement step, returning a function that closes it with
 * the supplement's own outcome (a failure that was swallowed still shows as
 * failed, with its reason). A no-op pair when nothing is being traced. */
export function traceLiteSupplement(
  debug: BotMoveDebugCollector | undefined,
  mainLineCount: number,
  requestDescription: string
): (outcome: { lineCount: number; error?: string }) => void {
  const trace = debug?.trace;
  if (!trace) return () => undefined;

  const stepId = trace.begin('Light browser engine supplement', `main engine gave ${mainLineCount} lines; asking the browser for ${requestDescription}`);
  return ({ lineCount, error }) =>
    trace.end(stepId, error ? { failed: true, detail: error } : { detail: `${lineCount} lines returned` });
}

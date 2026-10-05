/** How long each piece of one coach turn took, for the debug popup: every
 * model call (with the time to its first output) and every server tool the
 * coach ran, in the order they finished. A client tool (show_position, ...) has
 * no server execution, so it shows only as a name in its model call's `calls`. */
export type TimelineEntry = ModelCallEntry | ToolCallEntry;

export interface ModelCallEntry {
  kind: 'model';
  /** Milliseconds from the start of the turn to the end of this call. */
  atMs: number;
  durationMs: number;
  /** Time to the first generated output, null when the provider streams none. */
  firstOutputMs: number | null;
  outputTokens: number;
  finishReason: string;
  /** The tools this call asked for, in order; empty when it only wrote text. */
  calls: string[];
}

export interface ToolCallEntry {
  kind: 'tool';
  atMs: number;
  durationMs: number;
  toolName: string;
  ok: boolean;
}

export interface TurnTimings {
  totalMs: number;
  entries: TimelineEntry[];
}

/** The parts of the AI SDK's per-call events the timer reads (structural, so
 * the timer stays a plain function of numbers and names). */
export interface ModelCallEnd {
  responseTimeMs: number;
  timeToFirstOutputMs: number | undefined;
  outputTokens: number;
  finishReason: string;
  toolNames: string[];
}

export interface ToolExecutionEnd {
  toolName: string;
  durationMs: number;
  ok: boolean;
}

export interface TurnTimer {
  modelCallEnded: (call: ModelCallEnd) => void;
  toolEnded: (tool: ToolExecutionEnd) => void;
  /** The timeline so far, with the turn's total as measured now. */
  finish: () => TurnTimings;
}

export function createTurnTimer(now: () => number = Date.now): TurnTimer {
  const startedAt = now();
  const entries: TimelineEntry[] = [];
  const atMs = (): number => now() - startedAt;

  return {
    modelCallEnded: (call) =>
      entries.push({
        kind: 'model',
        atMs: atMs(),
        durationMs: Math.round(call.responseTimeMs),
        firstOutputMs: call.timeToFirstOutputMs === undefined ? null : Math.round(call.timeToFirstOutputMs),
        outputTokens: call.outputTokens,
        finishReason: call.finishReason,
        calls: call.toolNames
      }),
    toolEnded: (tool) => entries.push({ kind: 'tool', atMs: atMs(), durationMs: Math.round(tool.durationMs), toolName: tool.toolName, ok: tool.ok }),
    finish: () => ({ totalMs: atMs(), entries: [...entries] })
  };
}

/** One structured model call (a course step): a single entry, no tools. */
export function singleCallTimings(durationMs: number, finishReason: string, outputTokens: number): TurnTimings {
  return {
    totalMs: durationMs,
    entries: [{ kind: 'model', atMs: durationMs, durationMs, firstOutputMs: null, outputTokens, finishReason, calls: [] }]
  };
}

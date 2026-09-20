import type { BotThinkingMove, BotThinkingStep } from '@freechesscoach/shared';

/**
 * The live "what is the bot doing right now" record for ONE bot move — the
 * data behind the Thinking log in the bot's status panel. Pure bookkeeping
 * with an injected clock: it never logs, never touches the engine or the DB,
 * and never changes what the bot does. Each unit of work (opening book
 * lookup, an engine attempt, candidate annotation, ...) is a step with a real
 * start and end time; `snapshot()` is safe to call while steps are still
 * running, which is how a stuck move shows up as a step that never ends.
 */
export interface BotMoveTrace {
  begin(label: string, detail?: string): number;
  end(id: number, outcome?: { detail?: string; failed?: boolean }): void;
  /** Times `fn` as one step; a rejection marks the step failed (with the
   * error message) and is rethrown untouched — never swallowed. */
  run<T>(label: string, fn: () => Promise<T>, options?: RunOptions<T>): Promise<T>;
  setPly(ply: number): void;
  setEngineMode(mode: NonNullable<BotThinkingMove['engineMode']>): void;
  setResult(result: { path: string; picked: string }): void;
  complete(): void;
  fail(reason: string): void;
  snapshot(): BotThinkingMove;
}

/** The slice of a trace the engine backends need: timing a call, or opening a
 * step now and closing it (possibly as failed) once the outcome is known. */
export type BotMoveStepTrace = Pick<BotMoveTrace, 'run' | 'begin' | 'end'>;

interface RunOptions<T> {
  detail?: string;
  describeResult?: (result: T) => string | undefined;
}

export interface BotMoveTraceOptions {
  /** Called after every change to the move (a step starting or ending, the
   * choice being recorded, the move settling) — how the registry mirrors a
   * live move to the other API pods (bot-thinking-registry.ts). */
  onChange?: () => void;
  now: () => number;
  source: BotThinkingMove['source'];
  ply: number | null;
}

export function createBotMoveTrace(options: BotMoveTraceOptions): BotMoveTrace {
  const { now, source } = options;
  const changed = () => options.onChange?.();
  const move: BotThinkingMove = {
    ply: options.ply,
    source,
    status: 'thinking',
    startedAt: now(),
    endedAt: null,
    path: null,
    picked: null,
    engineMode: null,
    steps: []
  };
  let nextId = 1;

  function findStep(id: number): BotThinkingStep | undefined {
    return move.steps.find((step) => step.id === id);
  }

  function begin(label: string, detail?: string): number {
    const id = nextId++;
    move.steps.push({ id, label, ...(detail !== undefined ? { detail } : {}), startedAt: now(), endedAt: null, status: 'running' });
    changed();
    return id;
  }

  function end(id: number, outcome: { detail?: string; failed?: boolean } = {}): void {
    const step = findStep(id);
    if (!step || step.status !== 'running') return;
    step.endedAt = now();
    step.status = outcome.failed ? 'failed' : 'done';
    if (outcome.detail !== undefined) step.detail = outcome.detail;
    changed();
  }

  async function run<T>(label: string, fn: () => Promise<T>, runOptions: RunOptions<T> = {}): Promise<T> {
    const id = begin(label, runOptions.detail);
    try {
      const result = await fn();
      end(id, { detail: runOptions.describeResult?.(result) ?? runOptions.detail });
      return result;
    } catch (error) {
      end(id, { failed: true, detail: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  function closeRunningSteps(status: 'done' | 'failed'): void {
    const endedAt = now();
    for (const step of move.steps) {
      if (step.status !== 'running') continue;
      step.endedAt = endedAt;
      step.status = status;
    }
  }

  function complete(): void {
    if (move.status !== 'thinking') return;
    closeRunningSteps('done');
    move.status = 'done';
    move.endedAt = now();
    changed();
  }

  function fail(reason: string): void {
    if (move.status !== 'thinking') return;
    closeRunningSteps('failed');
    const at = now();
    move.steps.push({ id: nextId++, label: 'Move failed', detail: reason, startedAt: at, endedAt: at, status: 'failed' });
    move.status = 'failed';
    move.endedAt = at;
    changed();
  }

  return {
    begin,
    end,
    run,
    setPly: (ply) => {
      move.ply = ply;
      changed();
    },
    setEngineMode: (mode) => {
      move.engineMode = mode;
      changed();
    },
    setResult: ({ path, picked }) => {
      move.path = path;
      move.picked = picked;
      changed();
    },
    complete,
    fail,
    snapshot: () => ({ ...move, steps: move.steps.map((step) => ({ ...step })) })
  };
}

/** `trace.run` when a move is being traced, otherwise just `fn()` — lets call
 * sites time a step without branching on whether anyone is watching. */
export function runTraced<T>(
  trace: BotMoveTrace | undefined,
  label: string,
  fn: () => Promise<T>,
  options?: { detail?: string; describeResult?: (result: T) => string | undefined }
): Promise<T> {
  return trace ? trace.run(label, fn, options) : fn();
}

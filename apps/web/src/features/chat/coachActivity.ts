import { DIAGNOSIS_CODES_BY_ID, type DiagnosisCodeId } from '@freechesscoach/shared';

/** One thing the coach did while preparing a reply, shown live under the chat
 * so the student can see what is happening behind the wait. */
export interface ActivityStep {
  id: string;
  toolName: string;
  label: string;
  status: 'running' | 'done' | 'failed';
  startedAt: number;
  /** Null while running. */
  endedAt: number | null;
  /** What came of it, in a few words (a refusal's reason, a saved note). */
  detail: string | null;
}

const LABELS: Record<string, string> = {
  get_user_profile: 'Reading your profile and habit history',
  get_diagnostic_profile: 'Checking your measured habits',
  get_player_stats: 'Comparing your games with your usual numbers',
  save_progress_notes: 'Writing your progress notes',
  end_session: 'Closing the session',
  assign_focused_session: 'Choosing practice for a habit',
  begin_review: 'Moving on to the game review',
  begin_wrap_up: 'Wrapping up the session',
  get_engine_analysis: 'Asking the engine about a position',
  check_moves: 'Checking a line of moves',
  check_position: 'Looking up a position',
  investigate_position: 'Investigating a position',
  record_finding: 'Noting what this moment showed',
  record_move_note: 'Making a note on this moment',
  note_progress: 'Noting a habit for the closing round',
  recall_move: 'Recalling an earlier moment',
  get_candidate_moves: 'Choosing a move',
  play_coach_move: 'Playing a move',
  undo_last_move: 'Taking a move back'
};

/** Tools that are not listed: the thread ledger is the coach's own bookkeeping
 * (architecture §7.1), and the board tools already show in the chat itself (a
 * position divider, an annotation note, a line on the board). */
const HIDDEN_TOOLS: ReadonlySet<string> = new Set(['update_threads', 'show_position', 'annotate_board', 'hypothetical_line', 'expect_move']);

const HABIT_ACTION_VERBS: Record<string, string> = {
  progress: 'Marking progress on',
  regress: 'Marking a setback on',
  graduate: 'Graduating',
  reopen: 'Reopening',
  create: 'Starting to track'
};

export function isHiddenFromActivity(toolName: string): boolean {
  return HIDDEN_TOOLS.has(toolName);
}

function habitName(code: unknown): string {
  if (typeof code !== 'string') return 'a habit';
  return DIAGNOSIS_CODES_BY_ID.get(code as DiagnosisCodeId)?.label ?? 'a habit';
}

function humanize(toolName: string): string {
  const words = toolName.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What the coach is doing when it calls `toolName` with `input`. */
export function activityLabel(toolName: string, input: unknown): string {
  if (toolName === 'propose_focus_area_update') {
    const { diagnosisCode, action } = (input ?? {}) as { diagnosisCode?: unknown; action?: unknown };
    const verb = typeof action === 'string' ? HABIT_ACTION_VERBS[action] : undefined;
    return `${verb ?? 'Updating'} habit: ${habitName(diagnosisCode)}`;
  }
  return LABELS[toolName] ?? humanize(toolName);
}

export interface ActivityOutcome {
  ok: boolean;
  detail: string | null;
}

/** Reads a server tool's result. The tools answer `{ error }`, `{ applied:
 * false, reason }` or `{ saved: false, reason }` when they could not do what
 * was asked, and the coach is told so; the student should see it too. */
export function activityOutcome(output: unknown): ActivityOutcome {
  if (typeof output !== 'object' || output === null) return { ok: true, detail: null };
  const result = output as { error?: unknown; applied?: unknown; saved?: unknown; reason?: unknown };
  if (typeof result.error === 'string') return { ok: false, detail: result.error };
  const refused = result.applied === false || result.saved === false;
  if (refused) return { ok: false, detail: typeof result.reason === 'string' ? result.reason : 'not applied' };
  return { ok: true, detail: null };
}

export function startStep(id: string, toolName: string, input: unknown, now: number): ActivityStep {
  return { id, toolName, label: activityLabel(toolName, input), status: 'running', startedAt: now, endedAt: null, detail: null };
}

export function finishStep(steps: ActivityStep[], id: string, outcome: ActivityOutcome, now: number): ActivityStep[] {
  return steps.map((step) =>
    step.id === id && step.status === 'running'
      ? { ...step, status: outcome.ok ? 'done' : 'failed', endedAt: now, detail: outcome.detail }
      : step
  );
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** How long the whole activity took, from the first step to the last one
 * finishing (or now, while one still runs). */
export function totalDuration(steps: ActivityStep[], now: number): number {
  const first = steps[0];
  if (!first) return 0;
  const end = Math.max(...steps.map((step) => step.endedAt ?? now));
  return end - first.startedAt;
}

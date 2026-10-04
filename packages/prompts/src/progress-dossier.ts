import type { HabitGameResult } from '@freechesscoach/chess-analysis';

/** What a progress round reads: the student's habits with what their games
 * show, the improved list, the coach's own long-term notes, and the games
 * analysed since the last session. Built by apps/api's progress-dossier
 * service; this module only renders. */
export interface DossierMeasure {
  episodes: number;
  opportunities: number;
  failureRate: number;
  confidence: string;
}

export interface DossierArea {
  label: string;
  /** The handle the coach addresses the area by in propose_focus_area_update; never said to the student. */
  code: string | null;
  status: 'active' | 'improving';
  isPrimary: boolean;
  /** The coach's own standing note, or the measured one the rebuild wrote. */
  note: string;
  measure: DossierMeasure | null;
  /** Oldest game first. */
  results: HabitGameResult[];
}

export interface DossierGraduated {
  label: string;
  code: string | null;
  graduatedAt: Date;
  /** A failure of this habit in a game played after it graduated. */
  cameBack: boolean;
}

export interface DossierNewGame {
  /** "vs blitzfox7, lost, 10+0". */
  label: string;
  /** Each focus area's chances in this game; an area with no chance is absent. */
  habits: { label: string; opportunities: number; failures: number }[];
}

export interface ProgressDossierInput {
  studentName: string;
  selfAssessment: string | null;
  areas: DossierArea[];
  graduated: DossierGraduated[];
  memory: string | null;
  lessons: { endedAt: Date; note: string }[];
  newGames: DossierNewGame[];
}

export function renderProgressDossier(input: ProgressDossierInput): string {
  return [
    '## Progress dossier',
    `Student: ${input.studentName}. In their own words about their weaknesses: "${input.selfAssessment ?? ''}"`,
    section('Working on now', input.areas.map(renderArea), '(no focus areas yet)'),
    section('Improved list (graduated)', input.graduated.map(renderGraduated), '(nothing has graduated yet)'),
    section('What you remember about this student', input.memory ? [input.memory] : [], '(nothing written yet)'),
    section('Recent lessons, newest first', input.lessons.map((lesson) => `- ${date(lesson.endedAt)}: ${lesson.note}`), '(no lesson notes yet)'),
    section('Games analysed since your last session', input.newGames.map(renderNewGame), '(none)')
  ].join('\n\n');
}

function section(title: string, lines: string[], empty: string): string {
  return `### ${title}\n${lines.length > 0 ? lines.join('\n') : empty}`;
}

function renderArea(area: DossierArea): string {
  const primary = area.isPrimary ? ', the main one' : '';
  const measure = area.measure
    ? `measured over recent games: it failed ${area.measure.episodes} of ${area.measure.opportunities} chances (${Math.round(area.measure.failureRate * 100)}%), ${area.measure.confidence} confidence`
    : 'not measured yet';
  return [`- ${area.label}${codeOf(area.code)} [${area.status}${primary}] — ${measure}.`, `  Last games, oldest to newest: ${renderResults(area.results)}.`, `  Note: ${area.note}`].join('\n');
}

function renderResults(results: HabitGameResult[]): string {
  if (results.length === 0) return 'no games analysed';
  return results.map(renderResult).join('; ');
}

function renderResult(result: HabitGameResult): string {
  const fresh = result.isNew ? ' (new)' : '';
  if (result.opportunities === 0) return `no chance came up${fresh}`;
  return `failed ${result.failures} of ${result.opportunities} chance${result.opportunities === 1 ? '' : 's'}${fresh}`;
}

function renderGraduated(entry: DossierGraduated): string {
  const back = entry.cameBack ? ' It has failed again in a game played since.' : ' No failure since.';
  return `- ${entry.label}${codeOf(entry.code)}, graduated ${date(entry.graduatedAt)}.${back}`;
}

function renderNewGame(game: DossierNewGame): string {
  if (game.habits.length === 0) return `- ${game.label}: none of your habits came up.`;
  const habits = game.habits.map((habit) => `${habit.label} failed ${habit.failures} of ${habit.opportunities}`).join('; ');
  return `- ${game.label}: ${habits}.`;
}

function codeOf(code: string | null): string {
  return code ? ` (${code})` : '';
}

function date(value: Date): string {
  return value.toISOString().slice(0, 10);
}

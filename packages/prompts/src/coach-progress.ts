import type { CoachPersona, RatingBand } from '@freechesscoach/shared';
import { CALIBRATION } from './calibration.js';
import { BOUNDARIES, FORMATTING, HOMEWORK_OPTIONS } from './coach-method.js';
import { PERSONA_VOICE } from './coach-persona.js';
import { diagnosisCodesForThisStudent, type CoachPromptUser, type CoachSystemPrompt, type GameMeta } from './coach-system.js';
import { DEV_COMMANDS } from './dev-commands.js';
import { renderProgressDossier, type ProgressDossierInput } from './progress-dossier.js';
import { briefToolCue, describeMoveRef } from './render.js';
import { coachToolSpecsFor } from './tools.js';

/**
 * The two progress rounds of a coaching session (docs/plan.md Phase 128): one
 * before the game review, one before closing. Each is its own episode — the
 * coach reads the student's progress dossier and no game — so the prompts here
 * are separate from the review's (coach-system.ts) and never mention a move.
 * Like the review's, the static part is shared by every student in a band and
 * persona, so it never names a student, a game or a rating.
 */
export type ProgressPhase = 'progress_open' | 'progress_close';

const NOTES_ARE_GENERAL = `## What a note is

Everything you write down in this round is long-term memory: you will read it months from now, about a student you will have forgotten the details of. So a note describes a HABIT or how this student learns — what they do, when, with what cue, what changed — and never one moment. No move numbers, no moves, no squares: "he counts the defenders of an attacked piece when asked, but does not scan for loose pieces before a capture" lasts; "at move 10 he saw the knight was defended" does not. A note that names a move or a square is refused and nothing is stored, so write it as the habit the first time.`;

const OPENING_ROUND = `## This is the progress check-in, before the game

You are about to review a game with your student. First, one short round about THEM: how they are doing on the habits you two are working on. You do not see the game yet and you do not discuss any move. "## Progress dossier" below holds everything: each habit with what their recent games show, the improved list, your own long-term notes, and the games analysed since you last met.

1. Greet them by name — this is the only greeting of the whole session, so make it yours (the voice above).
2. Read the dossier. For each habit ask what the last games say, and what your lesson notes say you were doing about it. Judge from the measured results and your notes, never from what the student says they do: a student can say the right thing without being able to do it. A game where the situation never came up is no evidence either way. Three active habits at most.
3. Make the changes the evidence supports, one propose_focus_area_update each: progress (getting better), regress (came back), graduate (handled across sessions — it goes on the improved list and frees a slot), reopen (a graduated habit failed again), create (a habit the games show that is not tracked). Rewrite a habit's note when your view of it changed; leave alone what did not change. Never touch the list silently and never invent a change to prove you are tracking.
4. Tell the student, in a few plain sentences and your own words (never the catalog code), what you see in their games and what you changed. Then ask ONCE whether they see it differently or want to add anything. This is a check-in, not an interview.
5. When they answer — or say they have nothing to add — react in a sentence, adjust anything they genuinely changed your mind about, and call begin_review. Nothing else starts the game review.`;

const CLOSING_ROUND = `## This is the closing progress round, after the game

The game review is over and the student is still here. This round is about keeping their progress: what today showed, written down so a later you can pick it up. "## Other moves discussed" is your own record of the moments you covered; "## Progress notes for this game" holds what you noted while you were in it. Below them is the progress dossier as it stood this morning.

1. Decide what today's evidence changes in each habit, with propose_focus_area_update (progress, regress, graduate, reopen, create — see its description). Judge from how they played and answered during the moments, never from what they said they took away from the game. Three active at most; a habit that has gone consistently well across sessions graduates, which frees a slot for the next one.
2. Call save_progress_notes: studentMemory (your one long-term text about this student, rewritten WHOLE — keep what is still true, change what is not, add what you learned about how they think and what teaches them best) and lessonNote (this session: what you worked on, how it went, what to do first next time).
3. Tell the student what moved, plainly and in your own words — which habit got better, which one needs work, what graduated — and give them the one piece of homework, tied to what you actually worked on. Say clearly that today's session is done.
4. Call end_session with a 2–3 sentence summary addressed to them and the homework.`;

function toolsSection(phase: ProgressPhase, isLocal: boolean): string {
  const bullets = coachToolSpecsFor('analyze', phase)
    .map((spec) => `- ${spec.name}: ${isLocal ? briefToolCue(spec.description) : spec.description}`)
    .join('\n');
  return `## Your tools\n\n${bullets}`;
}

function staticPart(persona: CoachPersona, phase: ProgressPhase, isLocal: boolean): string {
  return [
    PERSONA_VOICE[persona],
    phase === 'progress_open' ? OPENING_ROUND : CLOSING_ROUND,
    NOTES_ARE_GENERAL,
    phase === 'progress_close' ? HOMEWORK_OPTIONS : '',
    FORMATTING,
    toolsSection(phase, isLocal),
    BOUNDARIES
  ]
    .filter(Boolean)
    .join('\n\n');
}

export interface ProgressPromptInput {
  phase: ProgressPhase;
  user: CoachPromptUser;
  band: RatingBand;
  rating: number;
  persona: CoachPersona;
  dossier: ProgressDossierInput;
  /** The game that was just reviewed; only the closing round names it. */
  game: GameMeta | null;
  /** The goal the review worked toward, when the plan had one. */
  sessionGoal: string | null;
  isLocal?: boolean;
  devCommands?: boolean;
}

export function buildProgressSystemPrompt(input: ProgressPromptInput): CoachSystemPrompt {
  const calibration = CALIBRATION[input.band];
  const where =
    input.phase === 'progress_open'
      ? 'You have not looked at the game yet.'
      : `You have just finished reviewing their game${input.game ? ` (${input.game.whiteName} vs ${input.game.blackName}, ${input.game.result}, ${input.game.timeControl}; they played ${input.game.userColor})` : ''}.`;
  const goal = input.phase === 'progress_close' && input.sessionGoal ? `\nThe goal this session worked toward: ${input.sessionGoal}` : '';
  return {
    staticPart: [input.devCommands ? DEV_COMMANDS : '', staticPart(input.persona, input.phase, input.isLocal ?? false)].filter(Boolean).join('\n\n'),
    dynamicPart: [
      `You are a personal chess coach in a one-on-one session with your student, ${input.user.displayName}. Right now you are doing the progress round, not the game review. ${where}${goal}`,
      `## Your student\n\n- Name: ${input.user.displayName}\n- Level: ${calibration.label} (${calibration.description})\n- Sessions together so far: ${input.user.sessionCount}`,
      diagnosisCodesForThisStudent(input.rating),
      renderProgressDossier(input.dossier)
    ].join('\n\n')
  };
}

export interface ProgressNoteLine {
  diagnosisCode: string | null;
  note: string;
}

/** What the coach left for itself during the review, in the order it left it. */
export function renderProgressNotesBlock(notes: readonly ProgressNoteLine[]): string {
  const body = notes.length === 0 ? '(none yet)' : notes.map((entry) => `- ${entry.diagnosisCode ? `(${entry.diagnosisCode}) ` : ''}${entry.note}`).join('\n');
  return `## Progress notes for this game\n\n${body}`;
}

/** The closing round's own instruction, after every cached layer: the game's
 * notes above are this game's; this says what the round is for. */
export function renderClosingRoundBlock(lastMoveRef: number | null): string {
  const where = lastMoveRef === null ? '' : ` The last moment you were on was ${describeMoveRef(lastMoveRef)}.`;
  return `## Closing note\n\nThis is the closing note about the game and about keeping the student's progress.${where} Do the closing round now: update their habits, write the notes, then tell them what moved and close the session.`;
}

import { clipCaption, clipLine, type CourseEpisode } from '@freechesscoach/shared';
import { CONFIG } from './config.js';
import type { CourseDossier } from './course-dossier.js';
import { arrowProblems, nodeProblems } from './course-verify-board.js';
import { episodeScope, moveLabel, type CourseVerifyNode, type EpisodeScope } from './course-verify-scope.js';
import { episodeTexts, moveProblems, numberProblems, phraseProblems, sameMove, sanTokens, tacticWordProblems } from './course-verify-text.js';

export type { CourseVerifyNode } from './course-verify-scope.js';

/** docs/courses.md §7, one code per check. */
export type CourseVerifyCode = 'nodes' | 'moves' | 'tactic-words' | 'numbers' | 'arrows' | 'lengths' | 'quiz' | 'phrases';

export interface CourseVerifyProblem {
  code: CourseVerifyCode;
  nodeId: string | null;
  /** For the creator: "Nd5 in the note on n14 is not in the analysis". */
  message: string;
}

/** Spoken words per clip move and per episode's clip (docs/courses.md §6.5). */
export interface CourseVerifyBudget {
  wordsPerBeat: number;
  wordsPerEpisode: number;
}

export interface CourseVerifyInput {
  episode: CourseEpisode;
  startFen: string;
  nodes: readonly CourseVerifyNode[];
  /** Null for a hand-written course with no engine pass: moves are then
   * checked for legality only, and tactic words and quiz eligibility are not
   * checked. */
  dossier: CourseDossier | null;
  /** The creator's direction; a percentage it gives may be repeated. */
  direction?: string;
  budget?: CourseVerifyBudget | null;
}

/** Every problem in one episode's script, in check order. Pure: the AI
 * pipeline runs it after every episode call, the editor on every edit. */
export function verifyCourseEpisode(input: CourseVerifyInput): CourseVerifyProblem[] {
  const { episode, dossier } = input;
  const scope = episodeScope(episode, input.startFen, input.nodes, dossier);
  if (!scope) {
    return [{ code: 'nodes', nodeId: episode.endNodeId, message: `The episode runs from ${episode.startNodeId} to ${episode.endNodeId}, which is not one line` }];
  }
  const texts = episodeTexts(episode);
  return [
    ...nodeProblems(episode, scope),
    ...moveProblems(texts, scope, dossier !== null),
    ...(dossier ? tacticWordProblems(texts, scope) : []),
    ...numberProblems(texts, input.direction ?? ''),
    ...arrowProblems(episode, scope),
    ...lengthProblems(episode, scope, input.budget ?? null),
    ...quizProblems(episode, scope, dossier !== null),
    ...phraseProblems(texts)
  ];
}

function lengthProblems(episode: CourseEpisode, scope: EpisodeScope, budget: CourseVerifyBudget | null): CourseVerifyProblem[] {
  const problems: CourseVerifyProblem[] = [];
  const { maxCaptionWords, maxNoteSentences, maxCriticalNoteSentences } = CONFIG.courses;
  const opener = episode.opener;
  if (opener && wordCount(opener.caption) > maxCaptionWords) {
    problems.push({ code: 'lengths', nodeId: null, message: `The opening card's caption has ${wordCount(opener.caption)} words (at most ${maxCaptionWords})` });
  }
  const long = episode.plies.filter((ply) => ply.long);
  const short = episode.plies.filter((ply) => ply.short);
  for (const ply of episode.plies.filter((each) => each.long || each.short)) {
    if (!ply.text.trim() && !(ply.short && ply.clipText?.trim())) problems.push({ code: 'lengths', nodeId: ply.nodeId, message: `${ply.nodeId} speaks but has no words; write them or untick it` });
  }
  for (const ply of long) {
    const limit = scope.facts.get(ply.nodeId)?.critical ? maxCriticalNoteSentences : maxNoteSentences;
    const sentences = sentenceCount(ply.text);
    if (sentences > limit) problems.push({ code: 'lengths', nodeId: ply.nodeId, message: `The line on ${ply.nodeId} has ${sentences} sentences (at most ${limit})` });
  }
  for (const ply of short) {
    const captionWords = wordCount(clipCaption(ply));
    if (captionWords > maxCaptionWords) problems.push({ code: 'lengths', nodeId: ply.nodeId, message: `The caption on ${ply.nodeId} has ${captionWords} words (at most ${maxCaptionWords})` });
    const sayWords = wordCount(clipLine(ply));
    if (budget && sayWords > budget.wordsPerBeat) {
      problems.push({ code: 'lengths', nodeId: ply.nodeId, message: `The clip line on ${ply.nodeId} has ${sayWords} words (at most ${budget.wordsPerBeat}); give it a shorter clip line` });
    }
  }
  const total = (opener ? wordCount(opener.say) : 0) + short.reduce((sum, ply) => sum + wordCount(clipLine(ply)), 0);
  if (budget && total > budget.wordsPerEpisode) {
    problems.push({ code: 'lengths', nodeId: null, message: `The clip has ${total} words (at most ${budget.wordsPerEpisode})` });
  }
  // The planning call's budget: how many moves may speak in each version.
  if (episode.budget && long.length > episode.budget.long) {
    problems.push({ code: 'lengths', nodeId: null, message: `${long.length} moves speak in the course (the plan allows ${episode.budget.long})` });
  }
  if (episode.budget && short.length > episode.budget.short) {
    problems.push({ code: 'lengths', nodeId: null, message: `${short.length} moves speak in the clip (the plan allows ${episode.budget.short})` });
  }
  return problems;
}

function quizProblems(episode: CourseEpisode, scope: EpisodeScope, hasAnalysis: boolean): CourseVerifyProblem[] {
  const quiz = episode.quiz;
  const answer = quiz ? scope.byId.get(quiz.answerNodeId) : undefined;
  if (!quiz) return [];
  if (!answer) return [{ code: 'quiz', nodeId: quiz.answerNodeId, message: `The quiz answer ${quiz.answerNodeId} is not a move in the course` }];

  const label = moveLabel(scope.fenBefore(answer.id), answer.san);
  const names = (text: string): boolean => sanTokens(text).some((san) => sameMove(san).some((form) => sameMove(answer.san).includes(form)));
  const problems: CourseVerifyProblem[] = [];
  if (hasAnalysis && !scope.facts.get(answer.id)?.quizEligible) {
    problems.push({ code: 'quiz', nodeId: answer.id, message: `The quiz answer ${label} is not the one clearly best move` });
  }
  if (names(quiz.hint)) problems.push({ code: 'quiz', nodeId: answer.id, message: `The quiz hint names the answer ${label}` });
  if (!names(quiz.reveal)) problems.push({ code: 'quiz', nodeId: answer.id, message: `The quiz reveal does not name the answer ${label}` });
  else if (wordCount(quiz.reveal) < CONFIG.courses.minRevealWords) {
    problems.push({ code: 'quiz', nodeId: answer.id, message: `The quiz reveal only names ${label}; say in one sentence why it works` });
  }
  return problems;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Move numbers ("6.", "6…") are not sentence ends. */
function sentenceCount(text: string): number {
  const withoutMoveNumbers = text.replace(/\b\d+(?:\.{1,3}|…)\s*(?=[KQRBNOa-h])/g, '');
  return withoutMoveNumbers.split(/[.!?]+(?:\s+|$)/).filter((sentence) => /\w/.test(sentence)).length;
}

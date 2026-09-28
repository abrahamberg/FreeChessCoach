import type { CourseEpisode } from '@freechesscoach/shared';
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

/** Spoken words per beat and per episode (docs/courses.md §6.5). */
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
  episode.beats.forEach((beat, index) => {
    if (!beat.say.trim() && !beat.caption.trim()) {
      problems.push({ code: 'lengths', nodeId: beat.nodeId, message: `Beat ${index + 1} has no words and no caption; write one or drop the beat` });
    }
    const captionWords = wordCount(beat.caption);
    if (captionWords > maxCaptionWords) {
      problems.push({ code: 'lengths', nodeId: beat.nodeId, message: `The caption of beat ${index + 1} has ${captionWords} words (at most ${maxCaptionWords})` });
    }
    const sayWords = wordCount(beat.say);
    if (budget && sayWords > budget.wordsPerBeat) {
      problems.push({ code: 'lengths', nodeId: beat.nodeId, message: `Beat ${index + 1} has ${sayWords} words (at most ${budget.wordsPerBeat})` });
    }
  });
  const total = episode.beats.reduce((sum, beat) => sum + wordCount(beat.say), 0);
  if (budget && total > budget.wordsPerEpisode) {
    problems.push({ code: 'lengths', nodeId: null, message: `The clip has ${total} words (at most ${budget.wordsPerEpisode})` });
  }
  for (const note of episode.notes) {
    const limit = scope.facts.get(note.nodeId)?.critical ? maxCriticalNoteSentences : maxNoteSentences;
    const sentences = sentenceCount(note.text);
    if (sentences > limit) problems.push({ code: 'lengths', nodeId: note.nodeId, message: `The note on ${note.nodeId} has ${sentences} sentences (at most ${limit})` });
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

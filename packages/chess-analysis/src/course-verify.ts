import { videoCaption, videoLine, type CourseEpisode } from '@freechesscoach/shared';
import { CONFIG } from './config.js';
import type { CourseDossier } from './course-dossier.js';
import { arrowProblems, nodeProblems } from './course-verify-board.js';
import { episodeScope, moveLabel, type CourseVerifyNode, type EpisodeScope } from './course-verify-scope.js';
import { episodeTexts, moveProblems, nodeIdProblems, numberProblems, phraseProblems, sameMove, sanTokens, tacticWordProblems } from './course-verify-text.js';

export type { CourseVerifyNode } from './course-verify-scope.js';

/** docs/courses.md §7, one code per check. */
export type CourseVerifyCode = 'nodes' | 'moves' | 'tactic-words' | 'numbers' | 'arrows' | 'lengths' | 'key-moves' | 'tempting' | 'quiz' | 'phrases' | 'reel' | 'video' | 'voice';

export interface CourseVerifyProblem {
  code: CourseVerifyCode;
  nodeId: string | null;
  /** For the creator: "Nd5 in the note on n14 is not in the analysis". */
  message: string;
}

/** Spoken words per video move and per episode in the video (docs/courses.md §6.5). */
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
    ...keyMoveProblems(episode, scope),
    ...(dossier ? temptingProblems(episode, scope) : []),
    ...quizProblems(episode, scope, dossier !== null),
    ...nodeIdProblems(texts),
    ...phraseProblems(texts)
  ];
}

function lengthProblems(episode: CourseEpisode, scope: EpisodeScope, budget: CourseVerifyBudget | null): CourseVerifyProblem[] {
  const problems: CourseVerifyProblem[] = [];
  const { maxCaptionWords, maxNoteSentences, maxCriticalNoteSentences } = CONFIG.courses;
  const course = episode.plies.filter((ply) => ply.course);
  const video = episode.plies.filter((ply) => ply.video);
  for (const ply of episode.plies.filter((each) => each.course || each.video)) {
    if (!ply.text.trim() && !(ply.video && ply.say?.trim())) problems.push({ code: 'lengths', nodeId: ply.nodeId, message: `${ply.nodeId} speaks but has no words; write them or untick it` });
  }
  for (const ply of course) {
    const limit = scope.facts.get(ply.nodeId)?.critical ? maxCriticalNoteSentences : maxNoteSentences;
    const sentences = sentenceCount(ply.text);
    if (sentences > limit) problems.push({ code: 'lengths', nodeId: ply.nodeId, message: `The line on ${ply.nodeId} has ${sentences} sentences (at most ${limit})` });
  }
  for (const ply of video) {
    const captionWords = wordCount(videoCaption(ply));
    if (captionWords > maxCaptionWords) problems.push({ code: 'lengths', nodeId: ply.nodeId, message: `The caption on ${ply.nodeId} has ${captionWords} words (at most ${maxCaptionWords})` });
    const sayWords = wordCount(videoLine(ply));
    if (budget && sayWords > budget.wordsPerBeat) {
      problems.push({ code: 'lengths', nodeId: ply.nodeId, message: `The video line on ${ply.nodeId} has ${sayWords} words (at most ${budget.wordsPerBeat}); give it a shorter video line` });
    }
  }
  const total = video.reduce((sum, ply) => sum + wordCount(videoLine(ply)), 0);
  if (budget && total > budget.wordsPerEpisode) {
    problems.push({ code: 'lengths', nodeId: null, message: `The video has ${total} words here (at most ${budget.wordsPerEpisode})` });
  }
  // The planning call's budget: how many moves may speak in each version.
  // A video the plan gave 0 was not planned: the creator may add it by hand,
  // with no budget to keep.
  if (episode.budget?.course && course.length > episode.budget.course) {
    problems.push({ code: 'lengths', nodeId: null, message: `${course.length} moves speak in the course (the plan allows ${episode.budget.course})` });
  }
  if (episode.budget?.video && video.length > episode.budget.video) {
    problems.push({ code: 'lengths', nodeId: null, message: `${video.length} moves speak in the video (the plan allows ${episode.budget.video})` });
  }
  return problems;
}

/** §13.5: a ply's tempting moves are the dossier's, at that move. */
function temptingProblems(episode: CourseEpisode, scope: EpisodeScope): CourseVerifyProblem[] {
  return episode.plies.flatMap((ply) => {
    const known = new Set((scope.facts.get(ply.nodeId)?.tempting ?? []).flatMap((each) => sameMove(each.san)));
    return (ply.tempting ?? []).flatMap((each) => [
      ...(sameMove(each.san).some((form) => known.has(form)) ? [] : [{ code: 'tempting' as const, nodeId: ply.nodeId, message: `${each.san} on ${ply.nodeId} is not one of the analysis's tempting moves there` }]),
      // The first real run pasted the dossier's line as the why.
      ...(/answered by|\((white|black) is /i.test(each.why)
        ? [{ code: 'tempting' as const, nodeId: ply.nodeId, message: `why ${each.san} fails on ${ply.nodeId} copies the analysis: say in the coach's words what it hopes for and what goes wrong` }]
        : [])
    ]);
  });
}

/** Code's key moves (CourseBudget.keyNodeIds) speak in every planned version. */
function keyMoveProblems(episode: CourseEpisode, scope: EpisodeScope): CourseVerifyProblem[] {
  const budget = episode.budget;
  if (!budget) return [];
  return (budget.keyNodeIds ?? []).flatMap((nodeId) => {
    const ply = episode.plies.find((each) => each.nodeId === nodeId);
    const node = scope.byId.get(nodeId);
    const label = node ? moveLabel(scope.fenBefore(nodeId), node.san) : nodeId;
    const missing = [budget.course > 0 && !ply?.course && 'the course', budget.video > 0 && !ply?.video && 'the video'].filter(Boolean);
    if (!missing.length) return [];
    return [{ code: 'key-moves' as const, nodeId, message: `${label} is a key move of this episode; let it speak in ${missing.join(' and ')}` }];
  });
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

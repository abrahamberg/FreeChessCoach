import type { CourseEpisode } from '@freechesscoach/shared';
import { CONFIG } from '../config.js';
import type { CourseDossier } from './dossier.js';
import { Chess } from 'chess.js';
import { arrowProblems, nodeProblems } from './verify-board.js';
import { pieceProblems, takenPieceProblems } from './verify-pieces.js';
import { moveLabel } from './moves.js';
import { episodeScope, type CourseVerifyNode, type EpisodeScope } from './verify-scope.js';
import { episodeTexts, moveProblems, nodeIdProblems, numberProblems, phraseProblems, sameMove, sanTokens, tacticWordProblems } from './verify-text.js';

export type { CourseVerifyNode } from './verify-scope.js';

/** docs/courses.md §7, one code per check. */
export type CourseVerifyCode = 'nodes' | 'moves' | 'pieces' | 'tactic-words' | 'numbers' | 'arrows' | 'lengths' | 'tempting' | 'quiz' | 'phrases' | 'voice';

export interface CourseVerifyProblem {
  code: CourseVerifyCode;
  nodeId: string | null;
  /** For the editor: "Nd5 in the note on n14 is not in the analysis". */
  message: string;
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
}

/** Every problem in one episode's course text, in check order. Pure: the
 * import and the publish check run it; the studio runs the same checks
 * (exported from verify-text.ts) on its videos' lines. */
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
    ...pieceProblems(episode, texts, scope),
    ...takenPieceProblems(texts, scope),
    ...numberProblems(texts, input.direction ?? ''),
    ...arrowProblems(episode, scope),
    ...lengthProblems(episode, scope),
    ...(dossier ? temptingProblems(episode, scope) : []),
    ...quizProblems(episode, scope, dossier !== null),
    ...baitProblems(episode, scope),
    ...nodeIdProblems(texts),
    ...phraseProblems(texts)
  ];
}

function lengthProblems(episode: CourseEpisode, scope: EpisodeScope): CourseVerifyProblem[] {
  const problems: CourseVerifyProblem[] = [];
  const { maxNoteSentences, maxCriticalNoteSentences, maxSolveNoteSentences } = CONFIG.courses;
  for (const ply of episode.plies.filter((each) => each.course)) {
    if (!ply.text.trim()) {
      problems.push({ code: 'lengths', nodeId: ply.nodeId, message: `${ply.nodeId} speaks but has no words; write them or untick it` });
      continue;
    }
    // A solve line walks the checks, captures and threats before the move;
    // an endgame's technique line says what the move keeps and what spoils it.
    const limit = episode.role === 'solve' || episode.role === 'technique' ? maxSolveNoteSentences : scope.facts.get(ply.nodeId)?.critical ? maxCriticalNoteSentences : maxNoteSentences;
    const sentences = sentenceCount(ply.text);
    if (sentences > limit) problems.push({ code: 'lengths', nodeId: ply.nodeId, message: `The line on ${ply.nodeId} has ${sentences} sentences (at most ${limit})` });
  }
  return problems;
}

/** §13.5: a ply's tempting moves are the dossier's, at that move. A solve
 * episode's move discusses every check the dossier lists there: the owner
 * wants the learner told why each other check fails. */
function temptingProblems(episode: CourseEpisode, scope: EpisodeScope): CourseVerifyProblem[] {
  const missingChecks =
    episode.role !== 'solve'
      ? []
      : scope.path.flatMap((nodeId) => {
          const checks = (scope.facts.get(nodeId)?.tempting ?? []).filter((each) => each.kind === 'check');
          const said = new Set((episode.plies.find((ply) => ply.nodeId === nodeId)?.tempting ?? []).flatMap((each) => sameMove(each.san)));
          const missing = checks.filter((each) => !sameMove(each.san).some((form) => said.has(form))).map((each) => each.san);
          const node = scope.byId.get(nodeId);
          const label = node ? moveLabel(scope.fenBefore(nodeId), node.san) : nodeId;
          return missing.length
            ? [{ code: 'tempting' as const, nodeId, message: `At ${label} the solver looks at every check: add ${missing.join(', ')} to the tempting moves there, each with why it fails` }]
            : [];
        });
  return [...missingChecks, ...episode.plies.flatMap((ply) => {
    const known = new Set((scope.facts.get(ply.nodeId)?.tempting ?? []).flatMap((each) => sameMove(each.san)));
    return (ply.tempting ?? []).flatMap((each) => [
      ...(sameMove(each.san).some((form) => known.has(form)) ? [] : [{ code: 'tempting' as const, nodeId: ply.nodeId, message: `${each.san} on ${ply.nodeId} is not one of the analysis's tempting moves there` }]),
      // The first real run pasted the dossier's line as the why.
      ...(/answered by|\((white|black) is /i.test(each.why)
        ? [{ code: 'tempting' as const, nodeId: ply.nodeId, message: `why ${each.san} fails on ${ply.nodeId} copies the analysis: say in the coach's words what it hopes for and what goes wrong` }]
        : [])
    ]);
  })];
}

const PIECE_NAMES: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

/**
 * A trap's bait line is the victim's side of the story and stops there: the
 * next move is the quiz, so the line never plays it for the learner. A run's
 * bait said "White pins your knight to your queen. Take the pawn; count king
 * threats before folding", one move before "What does Black play here?".
 */
function baitProblems(episode: CourseEpisode, scope: EpisodeScope): CourseVerifyProblem[] {
  if (episode.role !== 'bait') return [];
  const ply = episode.plies.find((each) => each.nodeId === episode.endNodeId);
  const bait = scope.byId.get(episode.endNodeId);
  const answer = [...scope.byId.values()].find((node) => node.parentId === episode.endNodeId);
  if (!ply || !bait || !answer) return [];
  const problems: CourseVerifyProblem[] = [];
  const label = moveLabel(bait.fenAfter, answer.san);
  const gives = givesAway(bait.fenAfter, answer.san);
  const found = gives(ply.text);
  if (found) problems.push({ code: 'quiz', nodeId: ply.nodeId, message: `the line on ${ply.nodeId} gives away the answer ${label} ("${found}"): the bait line is the victim's side (what the move wants, why anyone would play it) and stops there; the learner finds the answer on the next move` });
  return problems;
}

/** Finds the words in a text that play `san` from `fen` for the learner: the
 * move itself, "the knight takes" or "take the pawn". */
export function givesAway(fen: string, san: string): (text: string) => string | null {
  const move = new Chess(fen).moves({ verbose: true }).find((each) => each.san === san);
  const mover = move ? PIECE_NAMES[move.piece] : null;
  const taken = move?.captured ? PIECE_NAMES[move.captured] : null;
  const patterns = [
    ...(mover && taken ? [new RegExp(`\\b${mover} (?:takes|captures|grabs)\\b`, 'i'), new RegExp(`\\b(?:take|capture|grab)s? (?:the|that|their|a|white's|black's) (?:\\w+ )?${taken}\\b`, 'i')] : [])
  ];
  return (text) => {
    const plain = text.replace(/’/g, "'");
    const named = sanTokens(plain).find((token) => sameMove(token).some((form) => sameMove(san).includes(form)));
    return named ?? patterns.map((pattern) => pattern.exec(plain)?.[0]).find(Boolean) ?? null;
  };
}

function quizProblems(episode: CourseEpisode, scope: EpisodeScope, hasAnalysis: boolean): CourseVerifyProblem[] {
  const quiz = episode.quiz;
  const answer = quiz ? scope.byId.get(quiz.answerNodeId) : undefined;
  if (!quiz) return [];
  if (!answer) return [{ code: 'quiz', nodeId: quiz.answerNodeId, message: `The quiz answer ${quiz.answerNodeId} is not a move in the course` }];

  const label = moveLabel(scope.fenBefore(answer.id), answer.san);
  const names = (text: string): boolean => sanTokens(text).some((san) => sameMove(san).some((form) => sameMove(answer.san).includes(form)));
  const problems: CourseVerifyProblem[] = [];
  const answerFacts = scope.facts.get(answer.id);
  if (hasAnalysis && !answerFacts?.quizEligible && !answerFacts?.creatorMarks.includes('quiz')) {
    problems.push({ code: 'quiz', nodeId: answer.id, message: `The quiz answer ${label} is not the one clearly best move` });
  }
  if (names(quiz.scene)) problems.push({ code: 'quiz', nodeId: answer.id, message: `The quiz scene names the answer ${label}: it sets the scene, the learner finds the move` });
  if (names(quiz.hint)) problems.push({ code: 'quiz', nodeId: answer.id, message: `The quiz hint names the answer ${label}` });
  // A puzzle run asked "Nf7+ or Ng6+?": half the answer.
  if (names(quiz.prompt)) problems.push({ code: 'quiz', nodeId: answer.id, message: `The quiz prompt names the answer ${label}` });
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

import { Chess } from 'chess.js';
import { BANNED_GENERIC_PHRASES, type CourseEpisode } from '@freechesscoach/shared';
import { CONFIG } from './config.js';
import type { CourseVerifyProblem } from './course-verify.js';
import type { EpisodeScope } from './course-verify-scope.js';
import { BARE_SAN, MOVE_TOKEN } from './san-token.js';
import { TACTIC_MOTIF_PHRASES } from './tactic-motif-phrases.js';

/** One piece of script text, and where the creator finds it. */
export interface EpisodeText {
  where: string;
  nodeId: string | null;
  text: string;
}

export function episodeTexts(episode: CourseEpisode): EpisodeText[] {
  const texts: EpisodeText[] = [];
  for (const ply of episode.plies) {
    texts.push({ where: `the line on ${ply.nodeId}`, nodeId: ply.nodeId, text: ply.text });
    if (ply.say) texts.push({ where: `the video line on ${ply.nodeId}`, nodeId: ply.nodeId, text: ply.say });
    if (ply.caption) texts.push({ where: `the caption on ${ply.nodeId}`, nodeId: ply.nodeId, text: ply.caption });
    for (const tempting of ply.tempting ?? []) texts.push({ where: `why ${tempting.san} fails on ${ply.nodeId}`, nodeId: ply.nodeId, text: tempting.why });
  }
  const quiz = episode.quiz;
  if (quiz) texts.push(...(['prompt', 'hint', 'reveal'] as const).map((field) => ({ where: `the quiz ${field}`, nodeId: quiz.answerNodeId, text: quiz[field] })));
  return texts;
}

const SQUARE = /^[a-h][1-8]$/;

/** Move mentions, by the chat's move-token grammar. A bare square ("the
 * bishop on c3") counts only with a move number in front ("7. c3"). */
export function sanTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const match of text.matchAll(BARE_SAN)) if (match[1] && !SQUARE.test(match[1])) tokens.add(match[1]);
  for (const match of text.matchAll(MOVE_TOKEN)) if (match[3]) tokens.add(match[3]);
  return [...tokens];
}

/** The same move written with or without check marks or disambiguation. */
export function sameMove(san: string): string[] {
  // "Qxc3+?" as the dossier writes a tempting move is Qxc3.
  const plain = san.replace(/[+#?!]+$/, '');
  return [plain, plain.replace(/^([KQRBN])[a-h]?[1-8]?(x?[a-h][1-8])/, '$1$2')];
}

/** Lesson moves up to the episode's end, and what the analysis names inside
 * it. With no analysis (a hand-written course), any legal move in its positions. */
export function moveProblems(texts: EpisodeText[], scope: EpisodeScope, hasAnalysis: boolean): CourseVerifyProblem[] {
  const allowed = new Set([...scope.playedSans, ...(hasAnalysis ? analysedMoves(scope) : legalMoves(scope))].flatMap(sameMove));
  return texts.flatMap(({ where, nodeId, text }) =>
    sanTokens(text)
      .filter((san) => !sameMove(san).some((form) => allowed.has(form)))
      .map((san) => ({ code: 'moves' as const, nodeId, message: `${san} in ${where} is not in the analysis` }))
  );
}

function analysedMoves(scope: EpisodeScope): string[] {
  return [...scope.claims].flatMap((nodeId) => {
    const facts = scope.facts.get(nodeId);
    if (!facts) return [];
    return [...(facts.bestInstead ? [facts.bestInstead.san, ...facts.bestInstead.line] : []), ...facts.alternatives.map((line) => line.san), ...facts.tempting.flatMap((tempting) => [tempting.san, ...tempting.refutation])];
  });
}

function legalMoves(scope: EpisodeScope): string[] {
  const fens = [...scope.inside].flatMap((nodeId) => [scope.fenBefore(nodeId), scope.byId.get(nodeId)?.fenAfter ?? '']);
  return fens.filter(Boolean).flatMap((fen) => new Chess(fen).moves());
}

const TACTIC_WORDS: { name: string; pattern: RegExp }[] = [
  { name: 'fork', pattern: /\bfork(?:s|ed|ing)?\b/gi },
  { name: 'pin', pattern: /\bpin(?:s|ned|ning)?\b/gi },
  { name: 'skewer', pattern: /\bskew(?:er)?(?:s|ed|ing)?\b/gi },
  { name: 'discovered attack', pattern: /\bdiscover(?:ed|s|y)\b/gi },
  { name: 'double check', pattern: /\bdouble[- ]check/gi },
  { name: 'mate', pattern: /\b(?:check)?mat(?:e|es|ed|ing)\b/gi },
  { name: 'stalemate', pattern: /\bstalemate/gi },
  { name: 'trapped piece', pattern: /\btrapped\b/gi },
  { name: 'deflection', pattern: /\bdeflect(?:ion|s|ed|ing)?\b/gi },
  { name: 'decoy', pattern: /\bdecoy/gi },
  { name: 'overloaded defender', pattern: /\boverload/gi },
  { name: 'X-ray', pattern: /\bx-?ray/gi },
  { name: 'in-between move', pattern: /\bin-between\b|\bzwischenzug/gi },
  { name: 'smothered mate', pattern: /\bsmothered\b/gi },
  { name: 'back-rank tactic', pattern: /\bback[- ]rank\b/gi },
  { name: 'windmill', pattern: /\bwindmill/gi },
  { name: 'desperado', pattern: /\bdesperado/gi },
  { name: 'interference', pattern: /\binterfer/gi },
  { name: 'clearance', pattern: /\bclearance\b/gi },
  { name: 'underpromotion', pattern: /\bunderpromot/gi }
];

/** A motif word only where the dossier's facts inside the episode use it too. */
export function tacticWordProblems(texts: EpisodeText[], scope: EpisodeScope): CourseVerifyProblem[] {
  const evidence = [...scope.claims]
    .flatMap((nodeId) => {
      const facts = scope.facts.get(nodeId);
      if (!facts) return [];
      return [facts.motif ? TACTIC_MOTIF_PHRASES[facts.motif].noun : '', ...facts.tactics, ...facts.board, ...(facts.bestInstead?.board ?? []), facts.after, facts.creatorComment ?? ''];
    })
    .join('\n');
  const supported = TACTIC_WORDS.filter(({ pattern }) => new RegExp(pattern.source, 'i').test(evidence));
  // A mated king is "trapped": that word is fair wherever the facts say mate.
  const mate = supported.some((family) => family.name === 'mate');
  if (mate) supported.push(...TACTIC_WORDS.filter((family) => family.name === 'trapped piece'));
  return texts.flatMap(({ where, nodeId, text }) =>
    TACTIC_WORDS.filter((family) => !supported.includes(family)).flatMap(({ name, pattern }) =>
      [...text.matchAll(pattern)].map((match) => ({
        code: 'tactic-words' as const,
        nodeId,
        message: `"${match[0].toLowerCase()}" in ${where}: the analysis finds no ${name} here`
      }))
    )
  );
}

const EVAL_NUMBER = /(?<![\w.])[+\-−]\d+(?:[.,]\d+)?(?!\w)|(?<![\w.])\d+\.\d+(?![\w.])|\bcentipawns?\b|\bevals?\b|\bcp\b/gi;
const PERCENT = /(\d+(?:\.\d+)?)\s?(?:%|percent\b)/gi;

/** No engine numbers; a percentage only when the creator's direction gives it. */
export function numberProblems(texts: EpisodeText[], direction: string): CourseVerifyProblem[] {
  const directionPercents = new Set([...direction.matchAll(PERCENT)].map((match) => match[1]));
  return texts.flatMap(({ where, nodeId, text }) => [
    ...[...text.matchAll(EVAL_NUMBER)].map((match) => match[0]),
    ...[...text.matchAll(PERCENT)].filter((match) => !directionPercents.has(match[1])).map((match) => match[0])
  ].map((found) => ({ code: 'numbers' as const, nodeId, message: `"${found}" in ${where} looks like an engine number` })));
}

/** Node ids are for the JSON's fields; a coach never says "n16" (the first
 * run's hook: "a forced mate at n16"). */
export function nodeIdProblems(texts: EpisodeText[]): CourseVerifyProblem[] {
  return texts.flatMap(({ where, nodeId, text }) => {
    const found = text.match(/\bn\d+\b/);
    return found ? [{ code: 'nodes' as const, nodeId, message: `${where} says "${found[0]}": name the move (8…Qc1#), never a node id` }] : [];
  });
}

export function phraseProblems(texts: EpisodeText[]): CourseVerifyProblem[] {
  return texts.flatMap(({ where, nodeId, text }) => {
    const lower = text.toLowerCase().replace(/’/g, "'");
    const stock = BANNED_GENERIC_PHRASES.filter((phrase) => lower.includes(phrase.toLowerCase())).map((phrase) => ({
      code: 'phrases' as const,
      nodeId,
      message: `"${phrase.toLowerCase()}" in ${where} is a stock phrase`
    }));
    // The prompt's word, not the learner's ("Qc5 is stronger in the dossier").
    const jargon = /\bdossier\b/.test(lower) ? [{ code: 'phrases' as const, nodeId, message: `${where} says "dossier": the learner never sees it; say "the engine", or just name the better move` }] : [];
    // Our list's words: "in the listed line", "no listed capture", "the given line", "and the continuation".
    const listed = /\b(listed|given line|the continuation)\b/.exec(lower);
    const ours = listed ? [{ code: 'phrases' as const, nodeId, message: `${where} says "${listed[0]}": the learner never sees our list; name the moves or say what happens` }] : [];
    return [...stock, ...jargon, ...ours];
  });
}

/** A length past its limit by more than `CONFIG.courses.lengthSlack`: a word
 * or two over is not worth a repair call that may bend the wording. */
export function overLength(value: number, limit: number): boolean {
  return value > limit * (1 + CONFIG.courses.lengthSlack);
}

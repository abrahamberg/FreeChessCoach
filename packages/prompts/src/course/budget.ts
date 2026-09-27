import { CONFIG, type CourseVerifyBudget } from '@freechesscoach/chess-analysis';
import { PERSONA_SPEECH_SPEED, type CoachPersona, type CourseKind, type CourseOutline } from '@freechesscoach/shared';

/** What one course's clip may hold (docs/courses.md §6.3). */
export interface CourseBudget {
  seconds: number;
  /** Spoken words in the whole clip, at this coach's speaking speed. */
  words: number;
  hookWords: number;
  wordsPerBeat: number;
  /** Opening reel: moves narrated at most; the rest get a caption only. */
  narratedMax: number;
  pauseSeconds: number;
}

export function courseBudget(kind: CourseKind, persona: CoachPersona): CourseBudget {
  const { clipSeconds, wordsPerSecond, hookWords, maxWordsPerBeat, quizPauseSeconds, secondsPerNarratedMove } = CONFIG.courses;
  const seconds = clipSeconds[kind];
  return {
    seconds,
    words: Math.floor(seconds * wordsPerSecond * PERSONA_SPEECH_SPEED[persona]),
    hookWords,
    wordsPerBeat: maxWordsPerBeat,
    narratedMax: Math.floor(seconds / secondsPerNarratedMove),
    pauseSeconds: quizPauseSeconds
  };
}

/** One episode's share of the clip's words, by how many nodes it narrates;
 * a hook gets the hook's limit. */
export function episodeWordBudget(budget: CourseBudget, outline: CourseOutline, episodeId: string): CourseVerifyBudget {
  const episodes = outline.chapters.flatMap((chapter) => chapter.episodes);
  const episode = episodes.find((candidate) => candidate.id === episodeId);
  const weight = (narrated: string[]): number => Math.max(1, narrated.length);
  const total = episodes.reduce((sum, candidate) => sum + weight(candidate.narratedNodeIds), 0);
  if (!episode) return { wordsPerBeat: budget.wordsPerBeat, wordsPerEpisode: 0 };
  if (episode.role === 'hook') return { wordsPerBeat: budget.hookWords, wordsPerEpisode: budget.hookWords };
  return { wordsPerBeat: budget.wordsPerBeat, wordsPerEpisode: Math.floor((budget.words * weight(episode.narratedNodeIds)) / total) };
}

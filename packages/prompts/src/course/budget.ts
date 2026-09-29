import { CONFIG, type CourseVerifyBudget } from '@freechesscoach/chess-analysis';
import { PERSONA_SPEECH_SPEED, type CoachPersona, type CourseKind, type CourseOutline } from '@freechesscoach/shared';

/** What one course's YouTube video may hold (docs/courses.md §13.4). */
export interface CourseBudget {
  /** The video's guide range; `words` and `narratedMax` follow the top. */
  minSeconds: number;
  seconds: number;
  /** Spoken words in the whole video, at this coach's speaking speed. */
  words: number;
  hookWords: number;
  wordsPerBeat: number;
  /** Moves the video narrates at most. */
  narratedMax: number;
  pauseSeconds: number;
}

export function courseBudget(kind: CourseKind, persona: CoachPersona): CourseBudget {
  const { videoSeconds, wordsPerSecond, hookWords, maxWordsPerBeat, quizPauseSeconds, secondsPerNarratedMove } = CONFIG.courses;
  const { min, max: seconds } = videoSeconds[kind];
  return {
    minSeconds: min,
    seconds,
    words: Math.floor(seconds * wordsPerSecond * PERSONA_SPEECH_SPEED[persona]),
    hookWords,
    wordsPerBeat: maxWordsPerBeat,
    narratedMax: Math.floor(seconds / secondsPerNarratedMove),
    pauseSeconds: quizPauseSeconds
  };
}

/** One episode's share of the video's words, by how many moves may speak
 * in its part of the video; a hook gets the hook's limit. */
export function episodeWordBudget(budget: CourseBudget, outline: CourseOutline, episodeId: string): CourseVerifyBudget {
  const episodes = outline.chapters.flatMap((chapter) => chapter.episodes);
  const episode = episodes.find((candidate) => candidate.id === episodeId);
  const weight = (video: number): number => Math.max(1, video);
  const total = episodes.reduce((sum, candidate) => sum + weight(candidate.budgetVideo), 0);
  if (!episode) return { wordsPerBeat: budget.wordsPerBeat, wordsPerEpisode: 0 };
  if (episode.role === 'hook') return { wordsPerBeat: budget.hookWords, wordsPerEpisode: budget.hookWords };
  return { wordsPerBeat: budget.wordsPerBeat, wordsPerEpisode: Math.floor((budget.words * weight(episode.budgetVideo)) / total) };
}

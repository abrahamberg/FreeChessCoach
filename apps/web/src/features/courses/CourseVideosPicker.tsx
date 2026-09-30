import type { CourseVideos } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import './CourseVideosPicker.css';

type Choice = 'both' | 'video' | 'reel';

const CHOICES: { value: Choice; label: string; videos: CourseVideos }[] = [
  { value: 'reel', label: 'Reel', videos: { video: false, reel: true } },
  { value: 'video', label: 'YouTube video', videos: { video: true, reel: false } },
  { value: 'both', label: 'Both', videos: { video: true, reel: true } }
];

const SUMMARY: Record<Choice, string> = {
  reel: '30–45 s for Shorts, Reels and TikTok: one idea that stops the scroll.',
  video: 'A YouTube lesson that tells the story and weighs the tempting moves.',
  both: 'The strong combination: the reel brings viewers to the video, the video to the course.'
};

function choiceOf(videos: CourseVideos): Choice {
  return videos.video && videos.reel ? 'both' : videos.video ? 'video' : 'reel';
}

/** docs/courses.md §13.1: the videos a course makes besides the course,
 * which is always made. The intake and the editor's Details card share it. */
export function CourseVideosPicker({ value, onChange, label = 'Videos' }: { value: CourseVideos; onChange: (videos: CourseVideos) => void; label?: string }): ReactNode {
  const chosen = choiceOf(value);
  return (
    <div className="course-videos">
      <span className="course-videos__label">{label}</span>
      <div className="course-videos__options" role="group" aria-label={label}>
        {CHOICES.map((choice) => (
          <button key={choice.value} type="button" className="course-videos__option" aria-pressed={chosen === choice.value} onClick={() => onChange(choice.videos)}>
            {choice.label}
          </button>
        ))}
      </div>
      <span className="meta">{SUMMARY[chosen]}</span>
    </div>
  );
}

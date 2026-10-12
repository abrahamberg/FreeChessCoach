import type { CourseQuiz } from '@freechesscoach/shared';
import type { ReactNode } from 'react';

export interface QuizAskingProps {
  quiz: CourseQuiz;
  hintShown: boolean;
  onHint: () => void;
  /** "Show the answer": plays it, with the reveal. */
  onShow: () => void;
  /** The learner's last try, when it was not the course's move; `why` is the
   * course's own word on that move, when it has one. */
  wrong: { san: string; why: string | null } | null;
}

/** The quiz step of the play-through (docs/plan.md M7): the coach sets the
 * scene, asks which move you would play, and waits; the learner moves on the
 * board, asks for a hint, or has the answer shown. Another move is never
 * called bad: it may be a good one, it is just not the lesson's. */
export function QuizAsking({ quiz, hintShown, onHint, onShow, wrong }: QuizAskingProps): ReactNode {
  return (
    <div className="course-player__quiz">
      {quiz.scene.trim() && <p className="course-player__scene">{quiz.scene}</p>}
      <p className="course-player__prompt">{quiz.prompt || 'Your move: what would you play here?'}</p>
      {wrong && (
        <p role="status">
          {wrong.san} is not the move we play here. {wrong.why ?? 'Have another look.'}
        </p>
      )}
      {hintShown && quiz.hint && <p className="meta">Hint: {quiz.hint}</p>}
      <div className="course-player__actions">
        {quiz.hint && !hintShown && (
          <button type="button" className="btn-secondary" onClick={onHint}>
            Hint
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onShow}>
          Show the answer
        </button>
      </div>
    </div>
  );
}

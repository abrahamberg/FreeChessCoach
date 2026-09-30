import { COURSE_STAGES, type CourseStage } from '@freechesscoach/chess-analysis';
import type { ReactNode } from 'react';
import { BoardMenu } from '../../../components/BoardMenu.js';
import { ArrowLeftIcon } from '../../../components/Icon.js';
import { OverflowMenu, type OverflowMenuItem } from '../../../components/OverflowMenu.js';
import { CourseStageBar, STAGE_LABELS } from './CourseStageBar.js';
import '../../session/SessionHeader.css';

export interface CourseHeaderProps {
  title: string;
  stage: CourseStage;
  done: ReadonlySet<CourseStage>;
  onStage: (stage: CourseStage) => void;
  /** Absent in the editor's preview, which has its own Close. */
  back?: { label: string; onBack: () => void };
  menuItems: OverflowMenuItem[];
  /** Signed in inside the app: the board views' account menu; else a plain one. */
  inApp: boolean;
  isDesktop: boolean;
}

/** The course's header, in the board views' style (SessionHeader): back,
 * the title, the four stages (the stage bar on a desktop, a compact picker
 * on a phone) and the "⋮" menu. */
export function CourseHeader({ title, stage, done, onStage, back, menuItems, inApp, isDesktop }: CourseHeaderProps): ReactNode {
  return (
    <header className="session-header course-header">
      {back && (
        <button type="button" className="session-header__back" onClick={back.onBack} aria-label={back.label} title={back.label}>
          <ArrowLeftIcon width={18} height={18} />
        </button>
      )}
      <h1 className="session-header__players course-header__title">{title}</h1>
      <span className="session-header__actions">
        {isDesktop ? (
          <CourseStageBar current={stage} done={done} onSelect={onStage} />
        ) : (
          <label className="course-header__stage">
            <span className="visually-hidden">Stage</span>
            <select value={stage} onChange={(event) => onStage(event.target.value as CourseStage)}>
              {COURSE_STAGES.map((each, index) => (
                <option key={each} value={each}>
                  {`${index + 1}. ${STAGE_LABELS[each]}${done.has(each) ? ' ✓' : ''}`}
                </option>
              ))}
            </select>
          </label>
        )}
        {inApp ? <BoardMenu label="Course options" items={menuItems} /> : menuItems.length > 0 && <OverflowMenu label="Course options" items={menuItems} />}
      </span>
    </header>
  );
}

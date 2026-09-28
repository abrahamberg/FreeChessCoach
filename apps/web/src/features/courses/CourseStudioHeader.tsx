import type { CourseStatus } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, EyeIcon, PlayCircleIcon } from '../../components/Icon.js';
import { OverflowMenu, type OverflowMenuItem } from '../../components/OverflowMenu.js';

const STATUS: Record<CourseStatus, { label: string; badge: string }> = {
  draft: { label: 'Draft', badge: 'badge' },
  unlisted: { label: 'Unlisted', badge: 'badge badge--info' },
  public: { label: 'Public', badge: 'badge badge--primary' },
  removed: { label: 'Removed', badge: 'badge badge--danger' }
};

export interface CourseStudioHeaderProps {
  title: string;
  onTitle: (title: string) => void;
  status: CourseStatus;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  /** Disabled until there is something to preview. */
  onPreviewClip?: () => void;
  onPreviewLearner?: () => void;
  onPublish?: () => void;
  published: boolean;
  more: OverflowMenuItem[];
}

/** The course editor's header (Phase 89): back to the studio, the title
 * edited in place, where the course stands, and its actions: Save first,
 * Preview (the clip, as a learner), Publish, the rarer ones in "⋮". */
export function CourseStudioHeader({ title, onTitle, status, dirty, saving, onSave, onPreviewClip, onPreviewLearner, onPublish, published, more }: CourseStudioHeaderProps): ReactNode {
  const badge = STATUS[status];
  return (
    <header className="studio-header">
      <Link to="/studio" className="studio-header__back" aria-label="Back to the Course studio" title="Course studio">
        <ArrowLeftIcon width={18} height={18} />
      </Link>
      <div className="studio-header__name">
        <input className="studio-header__title" value={title} maxLength={120} placeholder="Untitled course" aria-label="Course title" onChange={(event) => onTitle(event.target.value)} />
        <span className="studio-header__state">
          <span className={badge.badge}>{badge.label}</span>
          <span className={dirty ? 'studio-header__save studio-header__save--dirty' : 'studio-header__save'} role="status">
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}
          </span>
        </span>
      </div>
      <div className="studio-header__actions">
        <div className="studio-header__preview" role="group" aria-label="Preview">
          <span className="studio-header__preview-label">Preview</span>
          <button type="button" disabled={!onPreviewClip} onClick={onPreviewClip}>
            <PlayCircleIcon width={16} height={16} />
            Clip
          </button>
          <button type="button" disabled={!onPreviewLearner} onClick={onPreviewLearner}>
            <EyeIcon width={16} height={16} />
            As learner
          </button>
        </div>
        <button type="button" className="btn-secondary" disabled={!onPublish} onClick={onPublish}>
          {published ? 'Publish again' : 'Publish'}
        </button>
        <button type="button" className="btn-primary" disabled={!dirty || saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <OverflowMenu label="More course actions" items={more} />
      </div>
    </header>
  );
}

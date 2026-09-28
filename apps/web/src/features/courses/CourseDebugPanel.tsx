import type { CourseDebugCall } from '@freechesscoach/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { describeApiError } from '../../api/client.js';
import { DebugPanelContent } from '../chat/DebugPanelContent.js';
import { TurnDebugSnapshotSchema, type TurnDebugSnapshot } from '../chat/useTurnDebugSnapshot.js';
import '../chat/DebugPanel.css';
import { useCourseDebug } from './courseApi.js';
import './CourseDebugPanel.css';

export interface CourseDebugPanelProps {
  courseId: string;
  generating: boolean;
  onClose: () => void;
}

/** Task 80.6, the course editor's "Debug last answer": the coach chat's debug
 * panel (DebugPanelContent), one AI call of the latest run at a time, with a
 * strip to pick the call and what our checks found in its answer. Opens on
 * the newest call. */
export function CourseDebugPanel({ courseId, generating, onClose }: CourseDebugPanelProps): ReactNode {
  const debug = useCourseDebug(courseId, generating);
  const calls = debug.data?.calls ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const index = picked ?? calls.length - 1;
  const call = calls[index];
  const snapshot = call ? TurnDebugSnapshotSchema.safeParse(call.snapshot) : null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const copy = async (value: TurnDebugSnapshot): Promise<void> => {
    await navigator.clipboard.writeText(JSON.stringify({ ...call, snapshot: value }, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  let status: string | null = null;
  if (debug.isPending) status = 'Loading…';
  else if (debug.error) status = describeApiError(debug.error) ?? 'Could not load debug data.';
  else if (!call) status = 'No AI calls yet. Write the course with AI first.';
  else if (snapshot && !snapshot.success) status = 'This call was logged in an older format.';

  return (
    <div className="debug-panel-backdrop" onClick={onClose}>
      <div className="debug-panel" role="dialog" aria-modal="true" aria-label="Course AI call debug" onClick={(event) => event.stopPropagation()}>
        {status && <div className="debug-panel__status">{status}</div>}
        {call && snapshot?.success && (
          <DebugPanelContent
            snapshot={snapshot.data}
            title={`Course AI call — ${callTitle(call)}`}
            context={`call ${index + 1} of ${calls.length} · ${(call.durationMs / 1000).toFixed(1)}s${generating ? ' · writing…' : ''}`}
            copied={copied}
            onCopy={(value) => void copy(value)}
            onClose={onClose}
          >
            <CallPicker calls={calls} index={index} onPick={setPicked} />
            <Checks call={call} />
          </DebugPanelContent>
        )}
      </div>
    </div>
  );
}

function callTitle(call: CourseDebugCall): string {
  const what = call.step === 'outline' ? 'outline' : `episode ${call.episodeId ?? ''}`;
  return call.repair ? `${what}, repair` : what;
}

function verdict(call: CourseDebugCall): { mark: string; tone: 'ok' | 'bad' | 'pending' } {
  if (call.error) return { mark: '!', tone: 'bad' };
  if (call.problems === null) return { mark: '…', tone: 'pending' };
  return call.problems.length === 0 ? { mark: '✓', tone: 'ok' } : { mark: `✗${call.problems.length}`, tone: 'bad' };
}

function CallPicker({ calls, index, onPick }: { calls: CourseDebugCall[]; index: number; onPick: (index: number) => void }): ReactNode {
  return (
    <div className="course-debug__picker" role="tablist" aria-label="AI calls">
      {calls.map((call, position) => {
        const { mark, tone } = verdict(call);
        return (
          <button
            key={`${call.at}-${position}`}
            type="button"
            role="tab"
            aria-selected={position === index}
            className={`debug-panel__btn course-debug__chip${position === index ? ' course-debug__chip--active' : ''}`}
            onClick={() => onPick(position)}
          >
            {position + 1}. {callTitle(call)} <span className={`course-debug__mark course-debug__mark--${tone}`}>{mark}</span>
          </button>
        );
      })}
    </div>
  );
}

function Checks({ call }: { call: CourseDebugCall }): ReactNode {
  if (call.error) return <p className="course-debug__checks course-debug__checks--bad">The call failed: {call.error}</p>;
  if (call.problems === null) return <p className="course-debug__checks">Not checked yet.</p>;
  if (call.problems.length === 0) return <p className="course-debug__checks course-debug__checks--ok">Our checks passed this answer.</p>;
  return (
    <div className="course-debug__checks course-debug__checks--bad">
      <p>Our checks found{call.repair ? ' (kept as warnings)' : ' (sent back in the repair call)'}:</p>
      <ul>
        {call.problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </div>
  );
}

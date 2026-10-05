import type { ReactNode } from 'react';
import { formatDuration } from './coachActivity.js';
import type { TimelineEntry, TurnDebugSnapshot } from './useTurnDebugSnapshot.js';

function describe(entry: TimelineEntry): { name: string; detail: string } {
  if (entry.kind === 'tool') return { name: entry.toolName, detail: entry.ok ? 'tool' : 'tool failed' };
  const asked = entry.calls.length > 0 ? `asked for ${entry.calls.join(', ')}` : 'wrote the reply';
  const first = entry.firstOutputMs === null ? '' : `, first output after ${formatDuration(entry.firstOutputMs)}`;
  return { name: 'model call', detail: `${asked} (${entry.outputTokens.toLocaleString()} output tokens${first}, ${entry.finishReason})` };
}

/** Where the time of one turn went: every model call and every server tool,
 * in the order they finished, with a bar scaled to the longest one. */
export function DebugTimeline({ timings }: { timings: TurnDebugSnapshot['response']['timings'] }): ReactNode {
  const longest = Math.max(1, ...timings.entries.map((entry) => entry.durationMs));
  return (
    <section className="debug-panel__timeline" aria-label="Timing">
      <div className="debug-panel__section-label">
        timing · {formatDuration(timings.totalMs)} in total · {timings.entries.length} {timings.entries.length === 1 ? 'step' : 'steps'}
      </div>
      <ol className="debug-panel__timeline-list">
        {timings.entries.map((entry, index) => {
          const { name, detail } = describe(entry);
          return (
            <li key={index} className={`debug-panel__timeline-row debug-panel__timeline-row--${entry.kind}${entry.kind === 'tool' && !entry.ok ? ' debug-panel__timeline-row--failed' : ''}`}>
              <span className="debug-panel__timeline-name">{name}</span>
              <span className="debug-panel__timeline-bar" aria-hidden="true">
                <span style={{ width: `${Math.max(2, (entry.durationMs / longest) * 100)}%` }} />
              </span>
              <span className="debug-panel__timeline-time">{formatDuration(entry.durationMs)}</span>
              <span className="debug-panel__timeline-detail">{detail}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

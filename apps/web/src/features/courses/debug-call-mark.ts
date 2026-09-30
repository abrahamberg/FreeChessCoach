import type { CourseDebugCall } from '@freechesscoach/shared';
import type { DebugCallPickerItem } from '../chat/DebugCallPicker.js';

export function callTitle(call: CourseDebugCall): string {
  const what = call.step === 'episode' ? `episode ${call.episodeId ?? ''}` : call.step;
  return call.repair ? `${what}, repair` : what;
}

export function verdict(call: CourseDebugCall): NonNullable<DebugCallPickerItem['mark']> {
  if (call.error) return { text: '!', tone: 'bad' };
  if (call.problems === null) return { text: '…', tone: 'pending' };
  return call.problems.length === 0 ? { text: '✓', tone: 'ok' } : { text: `✗${call.problems.length}`, tone: 'bad' };
}

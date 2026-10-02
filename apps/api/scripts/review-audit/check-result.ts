import type { CheckResult } from './types.js';

export function result(check: string, ok: boolean, detail = ''): CheckResult {
  return { check, ok, detail: ok ? '' : detail };
}

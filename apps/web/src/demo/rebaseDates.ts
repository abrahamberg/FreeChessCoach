const DAY_MS = 86_400_000;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The fixtures were recorded on one day, but "lesson 4 days ago" has to stay
 * true whenever the demo is opened. Every timestamp moves forward by the whole
 * days since the recording (whole days, so weekly buckets stay aligned). */
export function rebaseDates<T>(value: T, recordedAt: string, now: Date): T {
  const shiftMs = Math.floor((now.getTime() - Date.parse(recordedAt)) / DAY_MS) * DAY_MS;
  return shiftMs <= 0 ? value : (shift(value, shiftMs) as T);
}

function shift(value: unknown, shiftMs: number): unknown {
  if (typeof value === 'string') return shiftString(value, shiftMs);
  if (Array.isArray(value)) return value.map((item) => shift(item, shiftMs));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shift(item, shiftMs)]));
  }
  return value;
}

function shiftString(text: string, shiftMs: number): string {
  if (ISO_DATE_TIME.test(text)) return new Date(Date.parse(text) + shiftMs).toISOString();
  if (ISO_DATE_ONLY.test(text)) return new Date(Date.parse(text) + shiftMs).toISOString().slice(0, 10);
  return text;
}

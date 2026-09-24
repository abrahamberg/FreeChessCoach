/** Task 77.1: wall-clock milliseconds per named step, in the order the steps
 * first ran. A step timed twice adds up. */
export interface StepTimer {
  timed<T>(label: string, fn: () => T | Promise<T>): Promise<T>;
  timings(): ReadonlyMap<string, number>;
}

export function createStepTimer(now: () => number = () => performance.now()): StepTimer {
  const elapsed = new Map<string, number>();
  return {
    async timed(label, fn) {
      const start = now();
      try {
        return await fn();
      } finally {
        elapsed.set(label, (elapsed.get(label) ?? 0) + (now() - start));
      }
    },
    timings: () => elapsed
  };
}

/** `label=<ms> label=<ms> ...`, rounded to whole milliseconds. */
export function formatTimings(timings: ReadonlyMap<string, number>): string {
  return [...timings].map(([label, ms]) => `${label}=${Math.round(ms)}`).join(' ');
}

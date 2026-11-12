/** At most `maxActive` tasks at once and `maxWaiting` in line behind them;
 * `run` answers null at once when the line is full, instead of queueing
 * without bound. */
export interface ConcurrencyGate {
  run<T>(task: () => Promise<T>): Promise<T> | null;
}

export function createConcurrencyGate(maxActive: number, maxWaiting: number): ConcurrencyGate {
  let active = 0;
  const waiting: Array<() => void> = [];
  const release = (): void => {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  };
  const acquire = (): Promise<void> | null => {
    if (active < maxActive) {
      active += 1;
      return Promise.resolve();
    }
    if (waiting.length >= maxWaiting) return null;
    return new Promise((resolve) => waiting.push(resolve));
  };
  return {
    run(task) {
      const turn = acquire();
      if (!turn) return null;
      return turn.then(task).finally(release);
    }
  };
}

/**
 * Runs `task`, resolving undefined instead of failing or waiting past
 * `timeoutMs` — for best-effort shared-state calls (Redis) that must never
 * stall or fail a live request. A failure is logged as a warning under
 * `label`, not thrown.
 */
export async function withDeadline<T>(label: string, task: () => Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs);
  });
  try {
    return await Promise.race([task(), deadline]);
  } catch (error) {
    console.warn(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

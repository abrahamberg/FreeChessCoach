/** A push-to-pull bridge for one streamed tunnel request: the registry's
 * message handler pushes chunks as frames arrive, and the consumer reads them
 * with `for await`. Ends on `end()`, throws on `fail()`. */
export interface ChunkQueue extends AsyncIterable<string> {
  push(chunk: string): void;
  end(): void;
  fail(error: Error): void;
}

export function createChunkQueue(): ChunkQueue {
  const buffered: string[] = [];
  let finished = false;
  let failure: Error | null = null;
  let wake: (() => void) | null = null;

  function notify(): void {
    wake?.();
    wake = null;
  }

  async function* iterate(): AsyncGenerator<string> {
    for (;;) {
      const next = buffered.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (failure) throw failure;
      if (finished) return;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  }

  return {
    push(chunk) {
      if (finished || failure) return;
      buffered.push(chunk);
      notify();
    },
    end() {
      finished = true;
      notify();
    },
    fail(error) {
      if (finished || failure) return;
      failure = error;
      notify();
    },
    [Symbol.asyncIterator]: iterate
  };
}

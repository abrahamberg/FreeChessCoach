import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude:
      process.env.RUN_CORPUS_TESTS === 'true'
        ? configDefaults.exclude
        : [
            ...configDefaults.exclude,
            '**/tactic-precision.test.ts',
            '**/tactic-detectors/registry-coverage.test.ts',
            '**/tactic-detectors/lichess-puzzle-validation.test.ts'
          ],
  }
});

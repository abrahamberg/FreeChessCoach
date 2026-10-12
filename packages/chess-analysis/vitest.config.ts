import { configDefaults, defineConfig } from 'vitest/config';
import { slowExclude } from '../../vitest.slow';

export default defineConfig({
  test: {
    exclude:
      process.env.RUN_CORPUS_TESTS === 'true'
        ? [...configDefaults.exclude, '**/dist/**', ...slowExclude]
        : [
            ...configDefaults.exclude,
            '**/dist/**',
            ...slowExclude,
            '**/tactic-precision.test.ts',
            '**/tactic-detectors/registry-coverage.test.ts',
            '**/tactic-detectors/lichess-puzzle-validation.test.ts'
          ],
  }
});

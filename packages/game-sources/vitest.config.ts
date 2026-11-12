import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest 4+ no longer excludes dist/ by default; tsc -b emits compiled
    // copies of every *.test.ts there.
    exclude: [...configDefaults.exclude, '**/dist/**'],
  }
});

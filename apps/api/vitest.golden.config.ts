import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/golden/**/*.golden.ts'],
    testTimeout: 120_000
  }
});

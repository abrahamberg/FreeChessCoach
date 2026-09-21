import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporter: 'dot',
    silent: true,
  },
});
import { configDefaults, defineConfig } from 'vitest/config';

const exclude = [...configDefaults.exclude, '**/dist/**'];

/**
 * Two tiers. `unit` needs nothing running. `db` talks to Postgres (a
 * Testcontainers one, or `TEST_DATABASE_URL`) and is every `*.db.test.ts`:
 * a test that imports `test/helpers/db.js` is named that way.
 */
export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['**/*.test.ts'], exclude: [...exclude, '**/*.db.test.ts'] } },
      { extends: true, test: { name: 'db', include: ['**/*.db.test.ts'], exclude, globalSetup: ['./test/helpers/global-setup.ts'] } }
    ]
  }
});

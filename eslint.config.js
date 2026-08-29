import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-bundle/**',
      '**/coverage/**',
      'eslint.config.js',
      '.claude/worktrees/**',
      // Staged by apps/web/scripts/copy-stockfish-assets.mjs from the
      // `stockfish` npm package — vendored, unminified-unfriendly build
      // output, not code this repo owns or should lint.
      'apps/web/src/engine/stockfish/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Served as-is by Vite from apps/web/public — runs in the service
    // worker global scope, not the browser/Node globals the rest of the
    // repo uses.
    files: ['apps/web/public/*-sw.js'],
    languageOptions: {
      globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly' }
    }
  },
  {
    // Plain Node scripts run directly with `node` (not compiled through
    // tsc), so they get none of the ambient Node types the rest of the repo
    // relies on to satisfy no-undef.
    files: ['apps/web/scripts/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly' }
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['vitest.workspace.ts'] },
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }]
    }
  }
);

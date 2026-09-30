#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

/**
 * The default loop: vitest walks the import graph from every file changed
 * since HEAD~1 (committed or not) to the tests that reach it, through the
 * root config's projects, the way CI does for a PR. A change with no test
 * reaching it runs nothing.
 *
 *   npm run test:changed                      # affected tests only
 *   npm run test:changed -- --package api     # one package's whole suite
 */
const PACKAGES: Record<string, string> = {
  'chess-analysis': '@freechesscoach/chess-analysis',
  shared: '@freechesscoach/shared',
  prompts: '@freechesscoach/prompts',
  api: '@freechesscoach/api',
  web: '@freechesscoach/web',
  engine: '@freechesscoach/engine'
};

const { values } = parseArgs({ options: { package: { type: 'string' } } });

function run(command: string, args: string[]): void {
  try {
    execFileSync(command, args, { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    console.error('Tests failed');
    process.exit(1);
  }
}

if (values.package) {
  const name = PACKAGES[values.package];
  if (!name) {
    console.error(`Unknown package "${values.package}". One of: ${Object.keys(PACKAGES).join(', ')}`);
    process.exit(1);
  }
  console.log(`Testing ${name} (whole suite)`);
  run('npm', ['run', 'test', '-w', name]);
} else {
  console.log('Testing what changed since HEAD~1');
  run('npx', ['vitest', 'run', '--changed', 'HEAD~1']);
}

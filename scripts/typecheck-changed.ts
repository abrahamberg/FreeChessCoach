#!/usr/bin/env tsx

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const PACKAGES = [
  { dir: 'packages/chess-analysis', name: '@freechesscoach/chess-analysis' },
  { dir: 'packages/shared', name: '@freechesscoach/shared' },
  { dir: 'packages/prompts', name: '@freechesscoach/prompts' },
  { dir: 'apps/api', name: '@freechesscoach/api' },
  { dir: 'apps/web', name: '@freechesscoach/web' },
  { dir: 'services/engine', name: '@freechesscoach/engine' },
];

function getChangedPackages(): { dir: string; name: string }[] {
  try {
    const output = execSync('git diff --name-only HEAD~1', { encoding: 'utf-8' }).trim();
    if (!output) return PACKAGES;
    const files = output.split('\n');
    const changed = new Set<string>();
    for (const file of files) {
      for (const pkg of PACKAGES) {
        if (file.startsWith(pkg.dir + '/')) {
          changed.add(pkg.dir);
        }
      }
    }
    return PACKAGES.filter(p => changed.has(p.dir));
  } catch {
    return PACKAGES;
  }
}

const changed = getChangedPackages();
if (changed.length === 0) {
  console.log('No packages changed, skipping typecheck');
  process.exit(0);
}

console.log(`Typechecking changed packages: ${changed.map(p => p.name).join(', ')}`);

for (const pkg of changed) {
  if (!existsSync(`${pkg.dir}/package.json`)) continue;
  console.log(`\n--- Typechecking ${pkg.name} ---`);
  try {
    execSync(`npm run typecheck -w ${pkg.name}`, { stdio: 'inherit', cwd: process.cwd() });
  } catch (e) {
    console.error(`Typecheck failed for ${pkg.name}`);
    process.exit(1);
  }
}

console.log('\nAll changed package typecheck passed!');
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');

/** The browser's own link colours are #0000ee and #551a8b, unreadable on the
 * dark theme. Any link without a class of its own must take the theme's colour,
 * visited or not. */
describe('base link styling', () => {
  test('colours every plain link, visited or not, from the theme primary', () => {
    expect(css).toMatch(/\ba,\s*a:visited\s*\{[^}]*color:\s*var\(--color-primary\)/);
  });

  test('has a hover colour from the theme too', () => {
    expect(css).toMatch(/a:hover\s*\{[^}]*color:\s*var\(--color-primary-hover\)/);
  });
});

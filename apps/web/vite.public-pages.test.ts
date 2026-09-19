import { describe, expect, it } from 'vitest';
import { publicPageFor } from './vite.public-pages.js';

describe('publicPageFor', () => {
  it.each(['tour', 'guide', 'keys', 'openai-key', 'privacy', 'terms'])('serves /%s from its static page, as nginx does', (name) => {
    expect(publicPageFor(`/${name}`)).toBe(`/${name}.html`);
  });

  it('keeps the query string', () => {
    expect(publicPageFor('/tour?x=1')).toBe('/tour.html?x=1');
  });

  it('serves the landing page at /?stay, the link that skips the signed-in redirect', () => {
    expect(publicPageFor('/?stay')).toBe('/landing.html?stay');
    expect(publicPageFor('/?a=1&stay')).toBe('/landing.html?a=1&stay');
  });

  it('leaves app routes, the demo and files alone', () => {
    for (const url of ['/', '/?other=1', '/games', '/demo/games', '/tour/extra', '/site.css', '/api/users/me']) expect(publicPageFor(url)).toBeNull();
  });
});

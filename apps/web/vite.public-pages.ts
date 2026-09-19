import type { Plugin } from 'vite';

/** The static pages docker/nginx.web.conf serves at clean URLs (exact `location =`
 * matches). Keep this list in step with that file. */
const PUBLIC_PAGES = new Set(['tour', 'guide', 'keys', 'openai-key', 'privacy', 'terms']);

/** `/tour` -> `/tour.html`, or null when the URL is not one of the static pages.
 * `/?stay` is the landing page: in production nginx serves it at `/`, and `stay`
 * stops it bouncing a signed-in visitor into the app (see landing.html). */
export function publicPageFor(url: string): string | null {
  const [path = '', query] = url.split('?');
  if (path === '/' && query !== undefined && query.split('&').includes('stay')) return `/landing.html?${query}`;
  const name = path.slice(1);
  if (!PUBLIC_PAGES.has(name)) return null;
  return `/${name}.html${query === undefined ? '' : `?${query}`}`;
}

/** Dev-server twin of nginx's exact-match locations. Without it Vite answers
 * `/tour` with the app shell, which has no such route and renders an empty page. */
export function publicPages(): Plugin {
  return {
    name: 'public-pages',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const page = request.url ? publicPageFor(request.url) : null;
        if (page) request.url = page;
        next();
      });
    }
  };
}

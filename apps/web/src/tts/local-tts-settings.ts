const STORAGE_KEY = 'fcc.localTtsUrl';

/** Kokoro-FastAPI's default address (the guide's Docker command publishes 8880). */
export const DEFAULT_LOCAL_TTS_URL = 'http://localhost:8880';

const DEFAULT_LOCAL_PORT = '8880';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// The port exactly as typed, if any: `host:1234`, `http://host:1234/path`,
// `user@host:1234`. `new URL` can't tell "no port" from ":80" (it drops a
// scheme's default port), and that difference decides the default below.
const TYPED_PORT = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^/?#@]*@)?(?:\[[^\]]*\]|[^/?#:]*)(?::(\d+))?(?:[/?#]|$)/i;

/** Turns what a person typed into the server's base address, or null when it
 * isn't usable. Accepts a bare port (`9000` -> localhost), a host
 * (`192.168.1.5`), `host:port`, or a full `http(s)://…` address, with or
 * without a trailing slash or `/v1`.
 *
 * With no port typed: `localhost` (and 127.0.0.1) mean Kokoro's own 8880;
 * any other host means the scheme's default, i.e. port 80 for http. */
export function normalizeLocalTtsUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d{1,5}$/.test(trimmed)) return normalizeLocalTtsUrl(`localhost:${trimmed}`);

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(hasScheme ? trimmed : `http://${trimmed}`);
  } catch {
    return null;
  }
  if (!url.hostname) return null;

  const typedPort = TYPED_PORT.exec(trimmed)?.[1];
  if (typedPort !== undefined && (Number(typedPort) < 1 || Number(typedPort) > 65535)) return null;
  const isPlainHttp = url.protocol === 'http:';
  const port = typedPort ?? (isPlainHttp && LOOPBACK_HOSTS.has(url.hostname) ? DEFAULT_LOCAL_PORT : '');
  const path = url.pathname.replace(/\/+$/, '').replace(/\/v1$/i, '');
  return `${url.protocol}//${url.hostname}${port ? `:${port}` : ''}${path}`;
}

/** Per-device on purpose: the voice server usually runs on this machine, so
 * the address is meaningless on another device and doesn't belong in the DB. */
export function readLocalTtsUrl(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return (stored !== null && normalizeLocalTtsUrl(stored)) || DEFAULT_LOCAL_TTS_URL;
  } catch {
    return DEFAULT_LOCAL_TTS_URL;
  }
}

/** Saves an already-normalized address, or clears it (null) to go back to the default. */
export function writeLocalTtsUrl(url: string | null): void {
  try {
    if (url === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, url);
  } catch {
    // Storage blocked (private window etc.) — the default address still works.
  }
}

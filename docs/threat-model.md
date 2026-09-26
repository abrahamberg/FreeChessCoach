# FreeChessCoach — Threat Model

Last full review: 2026-09-25 (commits `cd5d988`..`3f53d43`).

This is the security threat model for the whole product: what we protect,
from whom, where the trust boundaries are, what was found, what was fixed, and
what is knowingly left open. Re-run it when a trust boundary changes (a new
external integration, a new way data leaves a user's scope, a change to the
proxy/auth setup).

## Method

1. **Model the system** as a data-flow diagram and mark every trust boundary.
2. **List assets** and **attacker profiles**.
3. **STRIDE per boundary** (Spoofing, Tampering, Repudiation, Information
   disclosure, Denial of service, Elevation of privilege), reading the code at
   each crossing rather than the docs.
4. **Rate** each threat: likelihood (who can do it, how hard) × impact (what
   they get). Critical / High / Medium / Low.
5. **Verify** before claiming: every finding below was reproduced against the
   code or the upstream source (e.g. oauth2-proxy v7.15.3), and every fix has a
   regression test or a rendered-config check.
6. **Mitigate, or accept with a reason.**

## System and trust boundaries

```
             P1 anonymous / P2 any Google user / P3 hostile website
                                   │
 ══ TB1 ═════════════════ Internet │ ═══════════════════════════════════════
                                   ▼
                        Ingress ─► oauth2-proxy  (session cookie, Google login,
                                   │              strips + sets X-Forwarded-*)
 ══ TB2 ═══════════════════════════╪═══════════════════════════════════════
                         /api/*    │   everything else
                     ┌─────────────┴──────────┐
                     ▼                        ▼
                ┌─────────┐              ┌─────────┐   SPA + WASM Stockfish
   TB3 (WS) ◄──►│   api   │              │   web   │   + Kokoro TTS run in
   browser tab  │ Fastify │              │  nginx  │   the user's browser
   tunnel       └─┬──┬──┬─┘              └─────────┘
                  │  │  │ TB4: user-chosen AI endpoint (outbound, BYO key)
                  │  │  └──────────────────────────────► OpenAI / Anthropic / any URL
                  │  │ TB5: /internal/engine-tunnel (shared token)
                  │  └──────────────◄── worker (graphile-worker)
                  │ TB6
                  ▼
       Postgres · Redis (unlock cache) · engine (Stockfish HTTP)
 ══ TB7: supply chain — npm, GitHub Actions, base images ══════════════════
```

| Boundary | Crossing | Authenticated by |
|---|---|---|
| TB1 | Internet → oauth2-proxy | Google OAuth session cookie |
| TB2 | oauth2-proxy → api | `X-Forwarded-Email/User/Preferred-Username` (proxy strips client copies); NetworkPolicy admits only proxy + worker pods |
| TB3 | browser tab ⇄ api WebSocket `/api/tunnel` | session cookie at handshake; socket bound to the authenticated user |
| TB4 | api → user-supplied AI endpoint | user's own API key |
| TB5 | worker → api `/internal/engine-tunnel/:userId` | shared `x-internal-token`; not routed by the proxy |
| TB6 | api/worker → Postgres, Redis, engine | in-cluster network + DB password |
| TB7 | code and artifacts we pull in | lockfile, Dependabot, CodeQL |

## Assets

| ID | Asset | Where it lives |
|---|---|---|
| A1 | User identity / session | oauth2-proxy cookie; identity headers at TB2 |
| A2 | Users' AI provider API keys | AES-256-GCM ciphertext in Postgres (key from the user's unlock phrase via scrypt); encrypted, HMAC-named entry in Redis while unlocked; a model change needs the phrase and cannot alter the endpoint or key |
| A3 | User data: games, analyses, coaching sessions, progress, bug reports | Postgres |
| A4 | Shared compute: Stockfish pool, api event loop | engine pods, api pods |
| A5 | The server's IP reputation with Lichess / Chess.com | outbound from api |
| A6 | Infrastructure secrets: internal relay token, unlock pepper/cache key, DB creds | Kubernetes Secrets |
| A7 | Build and release integrity | GitHub Actions, GHCR images, npm |

## Attacker profiles

- **P1 — Anonymous internet user.** Reaches only oauth2-proxy and the
  skip-auth public pages.
- **P2 — Any signed-in user.** Sign-up is open (`email_domains = ["*"]`), so
  this is the *primary* attacker: anyone with a Google account. Every
  per-user guarantee must hold against P2.
- **P3 — A hostile website** a signed-in user visits (CSRF, cross-site
  WebSocket, clickjacking).
- **P4 — Foothold inside the cluster** (a compromised pod or leaked internal
  secret). Defence in depth only.
- **P5 — Malicious or vulnerable dependency** (TB7).
- **P6 — Adversarial content**: crafted PGN, model output, prompt injection.

## Findings

Severity = likelihood × impact for the stated attacker. All **Fixed** items
have tests or rendered-config assertions; commit hashes are on `main`.

| ID | STRIDE | Where | Threat | Attacker | Sev. | Status |
|---|---|---|---|---|---|---|
| T1 | S, E | TB2 | **Identity spoofing.** The api read `X-Auth-Request-Email` before `X-Forwarded-Email`. In reverse-proxy mode oauth2-proxy strips and re-sets only the `X-Forwarded-*` user headers; `X-Auth-Request-*` are *response* headers (`set_xauthrequest`) and a client-sent copy reaches the api untouched. Any signed-in user could send `X-Auth-Request-Email: victim@…` and become the victim: read and delete their data, and spend their AI key while it is unlocked. Confirmed against oauth2-proxy v7.15.3 source (`legacy_options.go`, `middleware/headers.go`). | P2 | **Critical** | Fixed `11be6a2` |
| T2 | I, E | TB4 | **SSRF via the AI endpoint.** Any `http(s)` URL was accepted, api egress is unrestricted, `fetch` followed redirects, and the setup test echoed 200 chars of any error body. An endpoint of `http://<release>-engine:8081`, `http://169.254.169.254/…` or any in-cluster service made the api pod POST there and report back, and connection errors mapped out internal ports. | P2 | **High** | Fixed `33b11c5` |
| T3 | T, I, D, E | TB7 | **Vulnerable dependencies**: 45 open Dependabot alerts, including Fastify schema-validation bypass and `X-Forwarded-*` spoofing, Kysely SQL injection via JSON paths, undici request smuggling / CRLF injection, fast-uri SSRF host confusion, js-yaml CPU exhaustion, sharp/libvips CVEs, vite/vitest dev-server file read. | P1–P5 | **High** | Fixed `98bee33` (all packages at latest; `npm audit`: 0) |
| T4 | D | TB2, TB3 | **Resource exhaustion.** `scryptSync` (~100 ms CPU) ran on the event loop for every unlock/save, and nothing limited the AI-setup probe (≈6 outbound calls each), engine analyze/hint/ping (shared Stockfish pool) or the Lichess/Chess.com list proxies (risking an IP ban, A5). One user could stall a pod. | P2 | Medium | Fixed `e496880` |
| T5 | S, T, I | TB3 | **Cross-site requests / WebSocket hijacking.** No Origin/Fetch-Metadata check; the proxy cookie had no explicit `SameSite`, and Firefox/Safari don't default to Lax. A hostile page could open `/api/tunnel` as the visitor (receive their coach prompts, answer engine requests with forged evals) or send body-less POSTs. Writes were mostly shielded by JSON-only bodies and unguessable UUIDs, so the WebSocket was the real exposure. | P3 | Medium | Fixed `e496880` (guard) + `11be6a2` (`cookie_samesite = "lax"`) |
| T6 | T, I | web | **No browser security headers**: no clickjacking protection, no `nosniff`, no CSP, no HSTS. Also a functional bug: nginx drops *all* inherited `add_header`s in a `location` that sets its own, so the COOP/COEP headers never reached any page in production (verified by running the old config in the real image). | P3 | Medium | Fixed `d9e7992`; script CSP is Report-Only (R1) |
| T7 | D | api, worker | **ReDoS** in PGN parsing (`stripMoveAnnotations`, the `[%fcc]` tag) and the eval-index reader: polynomial regexes on user-supplied PGN (CodeQL `js/polynomial-redos`). | P2 | Medium | Fixed `cd5d988` |
| T8 | T | TB3 | **The tab ran any server-sent `fetch`**, with same-origin cookies. Only `https://chess-api.com` is legitimate; a forged tunnel message (P4, or a bug) could make the tab call the app's own API as the user or probe their LAN. | P4 | Low | Fixed `d9e7992` |
| T9 | S | TB5 | **Internal relay token**: compared with `!==` (timing leak), any length accepted, and the chart never provisioned it (it could only arrive via `extraEnv`, which invites a literal in values). | P4 | Low | Fixed `11be6a2` |
| T10 | E | deploy | **Footguns**: `authMode: dev-stub` (every request is one fixed user) was renderable by the chart; pods auto-mounted Kubernetes API tokens they never use; WebSocket frames up to 100 MiB. | P4 | Low | Fixed `11be6a2`, `e496880` |
| T11 | T | import | **Platform detection by substring**: `Site` containing `lichess.org` anywhere (e.g. `evil.com/?lichess.org`) was treated as Lichess when auto-linking usernames (CodeQL `js/incomplete-url-substring-sanitization`). | P2 | Low | Fixed `cd5d988` |
| T12 | E | TB7 | CI workflow ran with the default (broad) `GITHUB_TOKEN` (CodeQL `actions/missing-workflow-permissions`). | P5 | Low | Fixed `cd5d988` |

### What each fix does

- **T1** — `plugins/auth-headers.ts` trusts only `X-Forwarded-{Email,User,Preferred-Username}`. The chart and compose drop `set_xauthrequest` and set `pass_user_headers`, `skip_auth_strip_headers` and `cookie_samesite = "lax"` explicitly; `deploy/helm/test.sh` fails if `set-xauthrequest` comes back.
- **T2** — `llm/endpoint-fetch.ts` + `llm/public-address.ts`: every call to a user endpoint (SDK providers, setup probe, cloud TTS) uses an undici `Agent` whose DNS `lookup` rejects loopback, RFC 1918/6598, link-local/metadata, multicast, reserved and IPv6 ULA/link-local/NAT64/mapped addresses. That runs at connect time, so DNS rebinding is covered. IP literals (which skip `lookup`) are checked up front, and `redirect: 'error'`. Opt out for self-hosted private model servers: `LLM_ALLOW_PRIVATE_ENDPOINTS=1`.
- **T4** — `plugins/route-rate-limit.ts`: per-user fixed-window limits sized from each route's legitimate UI rate plus headroom (setup probe/save 15/min, local-model list 60/min, cloud-model list 30/min, unlock 10/5 min, engine analyze/hint 240/min, ping 15/min, remote game lists 60/min). On top of those, every `/api` route shares a floor of 600 requests/min per user (`plugins/api-rate-limit.ts`; the busiest real client, a bot game, is ~200/min). Every 429 carries `Retry-After`, and the web client shows it as a non-blocking countdown toast (`components/RateLimitNotice.tsx`) whichever request was refused. Background work (worker analysis via the internal relay, the WebSocket tunnel, coach turns, TTS, imports) is deliberately not limited. Every refusal is logged with its route. It's a plain `preHandler`: `@fastify/rate-limit` was tried and its limits **silently never applied**, because its `onRoute` hook loads after `buildApp` registers routes. The test caught it. Key derivation uses async `scrypt`.
- **T5** — `plugins/cross-site-guard.ts`: refuses non-GET requests and WebSocket handshakes marked `Sec-Fetch-Site: cross-site|same-site`, falling back to Origin-vs-Host. Non-browser callers (worker, scripts) send neither and pass.
- **T6** — `docker/nginx.security-headers.conf`, included in every location: COOP/COEP, `nosniff`, `Referrer-Policy`, HSTS, `Permissions-Policy`, `X-Frame-Options: DENY` plus an enforced CSP of `frame-ancestors 'none'; object-src 'none'; base-uri 'self'`, and the full script/connect policy as `Content-Security-Policy-Report-Only`.
- **T8** — `engine/tunnel-engine-handlers.ts`: `fetch` tunnel requests must be `https://chess-api.com`, sent with `credentials: 'omit'`.
- **T9** — SHA-256 + `timingSafeEqual`; `requireInternalToken()` refuses to boot with fewer than 32 characters outside dev-stub; `internalApi.existingSecret` wires the token and `API_INTERNAL_URL` from a Secret.

## Reviewed and found sound (no change)

- **Authorization / IDOR**: every `:id` route and the services behind them load
  through `findByIdForUser` / `findSessionByIdForUser`; coach tools take
  game/session/user IDs from the server-side turn context, never from model
  output (no tool schema has an ID parameter).
- **Tunnel binding**: `/api/tunnel` registers the socket under the authenticated
  user only, never a client-supplied ID.
- **Engine**: FEN is checked with `validateFen` before it reaches Stockfish's
  stdin (a newline can't inject UCI commands); depth and multiPV for user-facing
  routes are fixed server-side.
- **Key custody**: AES-256-GCM with random 16-byte salt and 12-byte IV per
  encryption, scrypt N=2^15/r=8; no server master key, so a database dump alone
  can't decrypt. Redis entries are HMAC-named (no user-ID mapping) and encrypted
  with a separate cache key.
- **Proxy routing**: oauth2-proxy upstreams expose only `/api/` and web, so
  `/internal/*` is unreachable from the internet; the api NetworkPolicy admits
  only proxy and worker pods; skip-auth routes are anchored regexes; oauth2-proxy
  7.15.3 is past the skip-auth query-string bypass (CVE-2025-54576).
- **SPA**: no `dangerouslySetInnerHTML`/`innerHTML` sinks, model output is
  rendered as text, and the demo's "back" link is a fixed allow-listed path.
- **Logging**: request logging is off and the error mapper doesn't log bodies
  or headers, so API keys and phrases don't reach logs.
- **Containers**: non-root uid 1000, `allowPrivilegeEscalation: false`, all
  capabilities dropped, `RuntimeDefault` seccomp, NetworkPolicies per
  component.

## Accepted risks and follow-ups

| ID | Item | Why it is open / what to do |
|---|---|---|
| R1 | Enforce the script CSP | The landing page has an inline script, and transformers.js/onnxruntime may load WASM or modules from a CDN for browser TTS. Watch the Report-Only violations in a browser, add the needed hash/origin, then promote the header in `nginx.security-headers.conf`. |
| R2 | Rate limits are per pod | In memory, so the effective cap is limit × replicas (2–6). Fine for abuse control; move to Redis if a hard cap is ever needed. |
| R3 | Browser-mode engine results are client-supplied | A user can skew their *own* analyses and rated-bot results. No leaderboard or cross-user effect. Accepted. |
| R4 | Prompt injection via PGN comments/headers or model output | Tools act only on the requesting user's data, with per-turn budgets. Self-impact only. Revisit if any sharing feature ships. |
| R5 | Redis may be unauthenticated in-cluster | Values are encrypted and names HMAC'd, so a Redis read alone yields nothing usable. Still recommended: Redis auth and a NetworkPolicy admitting only api and worker. |
| R6 | `database.sslMode: disable` default | Fine for the in-cluster subchart; use `require` or stricter for a managed database (already documented in values). |
| R7 | Supply chain: actions, base images, auto-merged updates | **Mitigated.** Actions are pinned to commit SHAs and base images (Docker Hardened Images) to digests; Dependabot bumps both. Minor/patch updates auto-merge only after the full CI suite and the image smoke test pass, with a 3-day release cooldown; majors wait for a human. Images publish only after CI passes on `main`. |
| R8 | TypeScript held at 6.0 | typescript-eslint doesn't yet support TS 7 (peer range `<6.1.0`); Dependabot ignores TS majors until it does. `@types/node` is held at 24.x to match the Node 24 LTS runtime. |
| R10 | Edge protection (Cloudflare) | App limits key on the signed-in user and so can't stop unauthenticated floods, which only oauth2-proxy sees. Cloudflare (free) handles volumetric DDoS and can add one IP-based rule; it only helps if the origin accepts traffic from Cloudflare alone (Cloudflare Tunnel, or ingress restricted to Cloudflare's IP ranges). |
| R9 | Open sign-up | By design; it's why P2 is the primary attacker and why all per-user controls above are required. |

## Operational notes for the next deploy

1. **Internal token length.** api and worker now **refuse to start** if
   `ENGINE_TUNNEL_INTERNAL_TOKEN` is under 32 characters (outside dev-stub).
   Check the deployed value first; `openssl rand -hex 32` makes a good one.
   Consider moving it to a Secret via `internalApi.existingSecret`.
2. **Identity headers.** Any proxy other than this chart's oauth2-proxy must
   send `X-Forwarded-Email`; `X-Auth-Request-*` is no longer read.
3. **Private AI endpoints.** A self-hosted install that points the server at a
   LAN/cluster model server must set `LLM_ALLOW_PRIVATE_ENDPOINTS=1`.
4. **COOP/COEP are live in production for the first time** (they only ever
   worked in the Vite dev server). The app has always run under them in dev,
   but watch for cross-origin resource breakage after the first deploy.
5. **Node 24 LTS** (`.nvmrc`; undici 8 and graphile-worker 0.18 need ≥ 22.19).
   The images run `dhi.io/node:24`; update local toolchains.
6. **Read-only root filesystem.** Every container now runs with
   `readOnlyRootFilesystem: true` (web gets a `/tmp` emptyDir), and the images
   have no shell — debug with `kubectl debug`, not `kubectl exec ... sh`.

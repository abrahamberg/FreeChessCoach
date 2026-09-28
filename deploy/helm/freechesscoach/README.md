# freechesscoach Helm chart

Umbrella chart for FreeChessCoach (`docs/architecture.md` §11): the nginx SPA,
the Fastify api, the graphile-worker, the Stockfish engine, fronted by
oauth2-proxy and backed by PostgreSQL 16.

- `values.yaml`: every setting, with its default and why.
- `values.example.yaml`: a worked production deployment, with the
  `kubectl create secret` commands it needs at the top.
- `../test.sh`: renders the chart and asserts what must stay true (public
  routes, identity headers, secrets never in values). Run it after any change.

Install or upgrade:

```sh
helm dependency build deploy/helm/freechesscoach
helm upgrade --install freechesscoach deploy/helm/freechesscoach -f my-values.yaml
```

Migrations run as a pre-install/pre-upgrade hook Job (`migrate.enabled`).

## Before the first deploy with courses (TODO for the owner)

Courses (`docs/courses.md`, Phases 79–83) add public pages and published
audio. The chart already carries the parts that are code; these are the
steps done by hand, once, when courses first go to production.

- [ ] **Migrations 0012–0019** run on upgrade (the hook Job); nothing to do,
      but expect the new `courses`, `course_*` and `debug_turns` tables.
- [ ] **Public routes** are in the chart's oauth2-proxy `extraArgs`
      (`^/learn/[a-z0-9-]+$`, `^/api/public/`) and asserted by `test.sh`. If
      you override `extraArgs` (e.g. for Lichess login), copy them too.
- [ ] **Course creators**: grant the flag per user,
      `npx tsx apps/api/scripts/course-creator.ts grant <email>`.
- [ ] **R2 mirror for learner audio** (optional but intended; without it
      learners get the audio from the api, which still works):
  1. In Cloudflare, create an R2 bucket (e.g. `freechesscoach-course-audio`).
  2. Connect a custom domain to it (e.g. `media.freechesscoach.org`). Not
     the r2.dev URL: Cloudflare rate-limits it and says it is not for
     production.
  3. Create an R2 API token with **Object Read & Write on that bucket
     only**.
  4. Create the Secret (keys exactly as below):

     ```sh
     kubectl create secret generic course-audio-r2 \
       --from-literal=endpoint=https://<account id>.r2.cloudflarestorage.com \
       --from-literal=bucket=freechesscoach-course-audio \
       --from-literal=accessKeyId=... \
       --from-literal=secretAccessKey=...
     ```

  5. Set in your values:

     ```yaml
     courseAudioMirror:
       existingSecret: course-audio-r2
       publicUrl: https://media.freechesscoach.org
     ```

  6. After the deploy, publish a course once and check its files appear in
     the bucket under `courses/<slug>/audio/`, and that the course page
     (`/learn/<slug>`) plays audio from the custom domain. This is the first
     run against real R2: the request signer (`apps/api/src/lib/s3-sign.ts`)
     is tested against AWS's published SigV4 example only. A failed copy is
     logged ("course audio mirror sync failed") and the page falls back to
     the api.
- [ ] **Cloudflare Cache Rule** for the api fallback: URI path starts with
      `/api/public/courses/` and ends with `.wav` → eligible for cache, edge
      TTL from the origin (the api sends `max-age=31536000, immutable`).
      Cloudflare does not cache `.wav` by default.
- [ ] **CSP**: `media-src` in `docker/nginx.security-headers.conf` allows
      `https:` for the bucket's domain (report-only today). Narrow it to the
      custom domain when the script CSP is enforced (threat model R1).
- [ ] **Removing a course** (moderation):
      `npx tsx apps/api/scripts/course-remove.ts <slug>` with the api's
      `DATABASE_URL` and `COURSE_AUDIO_*` env; then purge the two prefixes it
      prints in Cloudflare (Caching → Purge by prefix), since the edge keeps
      copies for up to a year.

Security notes for these: `docs/threat-model.md` T13 and R10.

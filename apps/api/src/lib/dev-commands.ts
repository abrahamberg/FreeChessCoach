/** Whether coach prompts carry the /dev developer-override rule
 * (packages/prompts' DEV_COMMANDS). Needs BOTH the explicit opt-in
 * (docker-compose.yml sets COACH_DEV_COMMANDS=1) AND dev-stub auth, which
 * production never runs (Helm sets AUTH_MODE=proxy) — so the flag leaking
 * into a production environment still can't turn it on there. */
export function isDevCommandsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.COACH_DEV_COMMANDS === '1' && env.AUTH_MODE === 'dev-stub';
}

import type { PositionAnalysis } from '@freechesscoach/shared';

/** How long a bot waits for the light engine (a browser tab) to check a
 * mistake before asking its own engine instead. The light search itself is
 * capped at 3 s (`LITE_SUPPLEMENT_MOVETIME_MS`); when it has not answered in
 * this time the tab is stalled or throttled, and waiting longer only delays the
 * reply. */
export const DEFAULT_BOT_VERIFY_LIGHT_TIMEOUT_MS = 2500;

/** After the light engine fails or times out, the bot stops asking it for this
 * long: a stalled tab stays stalled, and re-asking on every check (and every
 * turn) cost a bot 4 s a check in real play. */
export const LIGHT_ENGINE_COOLDOWN_MS = 5 * 60 * 1000;

type Analyze = (fen: string) => Promise<PositionAnalysis>;

/** "Is the light engine worth asking right now?" — remembers a failure for
 * `LIGHT_ENGINE_COOLDOWN_MS`. One per user (`lightEngineCooldownFor`), so it
 * outlives the single request that noticed. */
export interface LightEngineCooldown {
  isCoolingDown(): boolean;
  trip(): void;
}

export function createLightEngineCooldown(now: () => number = Date.now, durationMs = LIGHT_ENGINE_COOLDOWN_MS): LightEngineCooldown {
  let until = 0;
  return {
    isCoolingDown: () => now() < until,
    trip: () => {
      until = now() + durationMs;
    }
  };
}

const cooldownsByUser = new Map<string, LightEngineCooldown>();

/** The user's own cooldown. Per API process, deliberately: it only saves a few
 * wasted seconds, so a second pod noticing the same stall for itself is fine. */
export function lightEngineCooldownFor(userId: string): LightEngineCooldown {
  let cooldown = cooldownsByUser.get(userId);
  if (!cooldown) {
    cooldown = createLightEngineCooldown();
    cooldownsByUser.set(userId, cooldown);
  }
  return cooldown;
}

/**
 * The check "is this move really a mistake?" — one shallow search of the
 * position after it. The light engine goes first (coarse and quick, and it
 * costs the server nothing); when no browser tab is connected, it does not
 * answer in time, or it recently failed (`cooldown`), the bot's own engine
 * answers with a small search instead. A missing light engine is the normal
 * case for some users, so it is not logged.
 */
export function verifyWithLightFirst(
  light: Analyze,
  fallback: Analyze,
  options: { timeoutMs?: number; cooldown?: LightEngineCooldown } = {}
): Analyze {
  const timeoutMs = options.timeoutMs ?? DEFAULT_BOT_VERIFY_LIGHT_TIMEOUT_MS;
  const cooldown = options.cooldown;

  return async (fen) => {
    if (!cooldown?.isCoolingDown()) {
      let timer: NodeJS.Timeout | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`the light engine did not answer within ${timeoutMs}ms`)), timeoutMs);
      });
      try {
        const analysis = await Promise.race([light(fen), deadline]);
        if (analysis.lines.length > 0 || analysis.bestMove !== null) return analysis;
      } catch {
        // Fall through to the bot's own engine.
      } finally {
        clearTimeout(timer);
      }
      cooldown?.trip();
    }
    return fallback(fen);
  };
}

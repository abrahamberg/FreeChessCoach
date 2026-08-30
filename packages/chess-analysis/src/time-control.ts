export type GameSpeed = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence' | 'unknown';

const BULLET_MAX_SECONDS = 180;
const BLITZ_MAX_SECONDS = 480;
const RAPID_MAX_SECONDS = 1500;
const INCREMENT_WEIGHT = 40;

/**
 * Classifies a PGN `TimeControl` header into a game speed, using Lichess's
 * own estimated-duration formula (`base + 40 * increment` seconds) rather
 * than base time alone, so e.g. "60+30" (a 30s increment) reads as rapid
 * rather than bullet.
 */
export function classifyTimeControl(raw: string | null): GameSpeed {
  if (!raw) return 'unknown';
  if (raw.includes('/')) return 'correspondence';

  const [baseRaw, incrementRaw] = raw.split('+');
  const base = Number(baseRaw);
  const increment = incrementRaw === undefined ? 0 : Number(incrementRaw);
  if (!Number.isFinite(base) || !Number.isFinite(increment)) return 'unknown';

  const estimatedSeconds = base + INCREMENT_WEIGHT * increment;
  if (estimatedSeconds < BULLET_MAX_SECONDS) return 'bullet';
  if (estimatedSeconds < BLITZ_MAX_SECONDS) return 'blitz';
  if (estimatedSeconds < RAPID_MAX_SECONDS) return 'rapid';
  return 'classical';
}

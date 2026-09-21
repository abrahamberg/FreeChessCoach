import {
  acceptsMistake,
  CONFIG,
  fenAfterSan,
  mistakeTier,
  moveLoss,
  type EvalScore,
  type MistakeBatcher,
  type MistakeTier,
  type MoverScore,
  type PositionState,
  type WantedMistake
} from '@freechesscoach/chess-analysis';
import type { PositionAnalysis } from '@freechesscoach/shared';
import type { BotMoveTrace } from './bot-move-trace.js';

/** A move the bot checked with the engine, and what the engine said. */
export interface VerifiedMove {
  san: string;
  tier: MistakeTier;
  /** What the move gave away, for the bot: win-percentage points (centipawns
   * when the bot is far ahead — `moveLoss`). */
  loss: number;
  /** The engine's score of the position the move leaves, White-perspective (the
   * eval saved with the move and used to rate it). */
  evalAfter: EvalScore;
}

export interface MistakeSearchResult {
  /** A move that really is the mistake the bot was after, or null. */
  found: VerifiedMove | null;
  /** Everything it checked, in order — the fallback pool when nothing qualified. */
  tried: VerifiedMove[];
}

export interface MistakeSearchInput {
  fen: string;
  mover: 'white' | 'black';
  /** The engine's score of the position for the bot, before it moves. */
  baseline: MoverScore;
  state: PositionState;
  wanted: WantedMistake;
  batcher: MistakeBatcher;
  /** Evaluates the position after a candidate — one call, one line is enough. */
  verify: (fenAfter: string) => Promise<PositionAnalysis>;
  now?: () => number;
  trace?: BotMoveTrace;
}

/**
 * The mistake-first loop: take the next plausible mistake from the screened
 * batches, ask the engine what the position after it is worth, and keep it when
 * it really is as bad as the bot wanted (`acceptsMistake` — judged in win
 * percentage, or centipawns when far ahead, so a lopsided position behaves); when it turns out to be a fine
 * move, try the next one. At most `maxVerifications` checks within `budgetMs`.
 *
 * - a bot that is far behind never goes looking (its best move is played);
 * - an engine that fails ends the search with what it has — one failure means
 *   the next would fail too, and the reply is waiting;
 * - nothing here throws for a bad answer: the caller falls back to `tried`.
 */
export async function searchForMistake(input: MistakeSearchInput): Promise<MistakeSearchResult> {
  const { fen, mover, baseline, state, wanted, batcher, verify, trace } = input;
  const now = input.now ?? Date.now;
  const { maxVerifications, budgetMs } = CONFIG.botMistake;
  const tried: VerifiedMove[] = [];
  if (state === 'losing') return { found: null, tried };

  const start = now();
  for (let batch = batcher.next(); batch; batch = batcher.next()) {
    for (const candidate of batch) {
      if (tried.length >= maxVerifications || now() - start >= budgetMs) return { found: null, tried };

      const fenAfter = fenAfterSan(fen, candidate.moveSan);
      if (fenAfter === null) continue;

      const step = trace?.begin(`Checking ${candidate.moveSan} with the engine (try ${tried.length + 1} of ${maxVerifications})`);
      let verified: VerifiedMove;
      try {
        verified = await checkMove(candidate.moveSan, fenAfter);
      } catch (error) {
        if (trace && step !== undefined) trace.end(step, { failed: true, detail: error instanceof Error ? error.message : String(error) });
        return { found: null, tried };
      }

      tried.push(verified);
      const kept = acceptsMistake(state, wanted, verified.tier);
      if (trace && step !== undefined) trace.end(step, { detail: kept ? `a ${verified.tier} — kept` : 'too good a move — trying another' });
      if (kept) return { found: verified, tried };
    }
  }
  return { found: null, tried };

  async function checkMove(san: string, fenAfter: string): Promise<VerifiedMove> {
    const analysis = await verify(fenAfter);
    const line = analysis.lines[0];
    const evalAfter: EvalScore = line ? { cp: line.cp, mateIn: line.mateIn } : { cp: analysis.eval.cp, mateIn: analysis.eval.mateIn };
    const afterForBot: MoverScore = mover === 'white' ? evalAfter : { cp: negate(evalAfter.cp), mateIn: negate(evalAfter.mateIn) };
    const loss = moveLoss(state, baseline, afterForBot);
    return { san, tier: mistakeTier(state, loss), loss, evalAfter };
  }
}

function negate(value: number | null): number | null {
  return value === null ? null : -value;
}

/** The verified move the bot plays when nothing qualified: the one that gave
 * away the most, so "just play something" is still the closest thing to a
 * mistake it found. Null when it checked nothing. */
export function closestToAMistake(tried: VerifiedMove[]): VerifiedMove | null {
  return tried.reduce<VerifiedMove | null>((worst, move) => (worst === null || move.loss > worst.loss ? move : worst), null);
}

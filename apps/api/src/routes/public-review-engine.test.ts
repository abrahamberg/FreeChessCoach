import type { EngineEval } from '@freechesscoach/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, test, vi } from 'vitest';
import { errorMapperPlugin } from '../plugins/error-mapper.js';
import { createPublicReviewEngine, type PublicReviewEngineLimits } from '../services/engine/public-review-engine.js';
import type { LichessEvalReader } from '../services/engine/lichess-eval-index.js';
import { registerPublicReviewEngineRoutes } from './public-review-engine.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const LIMITS: PublicReviewEngineLimits = {
  perVisitor: { max: 2, windowMs: 60_000 },
  allVisitors: { max: 100, windowMs: 60_000 },
  maxActive: 1,
  maxWaiting: 0
};

/** The index knows only the start position. */
const index: LichessEvalReader = {
  lookup: async (fen) => (fen === START ? { depth: 40, lines: [{ pvUci: ['e2e4'], cp: 20, mate: null }] } : null)
};

function searchedEval(fen: string, ply: number): EngineEval {
  return { ply, fen, depth: 12, lines: [{ moveUci: 'e7e5', moveSan: 'e5', cp: 30, mateIn: null }] };
}

function appWith(analyzeGame = vi.fn(async (fens: string[]) => fens.map(searchedEval))): FastifyInstance {
  const app = Fastify();
  void app.register(errorMapperPlugin);
  const engine = createPublicReviewEngine(index, { analyzeGame, analyzePosition: vi.fn() }, LIMITS);
  registerPublicReviewEngineRoutes(app, engine);
  return app;
}

const post = (app: FastifyInstance, fens: string[], visitor = '203.0.113.7') =>
  app.inject({ method: 'POST', url: '/api/public/review-engine', headers: { 'cf-connecting-ip': visitor }, payload: { fens, multiPv: 3 } });

describe('POST /api/public/review-engine', () => {
  test('answers indexed positions from the index and searches only the rest, at the review depth', async () => {
    const analyzeGame = vi.fn(async (fens: string[]) => fens.map(searchedEval));
    const response = await post(appWith(analyzeGame), [START, AFTER_E4]);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ evals: EngineEval[]; cached: number }>();
    expect(body.cached).toBe(1);
    expect(body.evals.map((e) => e.lines[0]?.moveSan)).toEqual(['e4', 'e5']);
    expect(analyzeGame).toHaveBeenCalledWith([AFTER_E4], { multiPv: 3, depth: 12, priority: 'background' });
  });

  test("past a visitor's allowance it answers 429 with Retry-After, and other visitors still get the engine", async () => {
    const app = appWith();
    expect((await post(app, [AFTER_E4, AFTER_E4])).statusCode).toBe(200);
    const refused = await post(app, [AFTER_E4]);
    expect(refused.statusCode).toBe(429);
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    expect((await post(app, [START])).statusCode, 'an index hit is still free').toBe(200);
    expect((await post(app, [AFTER_E4], '198.51.100.1')).statusCode).toBe(200);
  });

  test('turns away a search while the engine is busy instead of queueing it', async () => {
    let finish: () => void = () => {};
    const slow = vi.fn((fens: string[]) => new Promise<EngineEval[]>((resolve) => (finish = () => resolve(fens.map(searchedEval)))));
    const app = appWith(slow);
    const first = post(app, [AFTER_E4], 'a');
    await vi.waitFor(() => expect(slow).toHaveBeenCalled());
    expect((await post(app, [AFTER_E4], 'b')).statusCode).toBe(429);
    finish();
    expect((await first).statusCode).toBe(200);
  });

  test('refuses a FEN that is not a legal position before it reaches the engine', async () => {
    const analyzeGame = vi.fn(async (fens: string[]) => fens.map(searchedEval));
    const response = await post(appWith(analyzeGame), ['8/8/8/8 w - - 0 1\nquit']);
    expect(response.statusCode).toBe(400);
    expect(analyzeGame).not.toHaveBeenCalled();
  });
});

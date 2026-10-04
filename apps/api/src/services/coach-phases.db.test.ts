import type { CoachingPlan, PositionAnalysis } from '@freechesscoach/shared';
import type { MockLanguageModelV4 } from 'ai/test';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { drain, mockResolution, multiStepModel } from '../../test/helpers/mock-model.js';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as sessionMessagesRepo from '../db/repositories/session-messages.js';
import * as sessionsRepo from '../db/repositories/sessions.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createMemoryLlmUnlockStore } from '../llm/unlock-store.js';
import * as coachAgent from './coach-agent.js';
import type { CoachAgentDependencies } from './coach-agent.js';

const PLAN: CoachingPlan = {
  gameSummary: 'A sharp game.',
  openingNote: 'Fine.',
  themes: ['king_safety'],
  connectionToHistory: 'First session together.',
  sessionGoal: 'Check every capture before moving.',
  moments: []
};

const PGN = `[Event "Test"]
[White "Ann"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

/** The three rounds of a coaching session, driven through the real turn code
 * with a scripted model: the progress check-in, the review, the closing round. */
describe('the rounds of a coaching session', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;
  const unlockStore = createMemoryLlmUnlockStore({ pepper: 'coach-phases-test', ttlSeconds: 60 });

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  function deps(model: MockLanguageModelV4): CoachAgentDependencies {
    return {
      db,
      jobQueue: { enqueueSummarizeSession: vi.fn() } as unknown as CoachAgentDependencies['jobQueue'],
      gatewayConfig: { unlockStore },
      analyzePosition: vi.fn().mockResolvedValue({
        fen: 'startpos',
        depth: 10,
        multiPv: 1,
        bestMove: 'e4',
        eval: { cp: 20, mateIn: null },
        lines: [{ moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4'], cp: 20, mateIn: null }],
        features: {
          turn: 'white',
          boardState: 'none',
          availableMoves: ['e4'],
          mobility: { white: 20, black: 20 },
          controlledSquares: [],
          piecesUnderAttack: [],
          overloadedDefenders: [],
          centerControlScore: { white: 0, black: 0 },
          openFiles: [],
          semiOpenFiles: [],
          doubledPawns: [],
          isolatedPawns: [],
          passedPawns: [],
          targetsAttacked: [],
          forks: [],
          captureOpportunities: []
        }
      } satisfies PositionAnalysis),
      callLightModel: vi.fn().mockResolvedValue('roughly equal.'),
      resolveModel: () => Promise.resolve(mockResolution(model))
    } as CoachAgentDependencies;
  }

  async function seedSession() {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: PGN,
      source: 'paste',
      userColor: 'white',
      whiteName: 'Ann',
      blackName: 'Bob',
      result: '1-0',
      timeControl: '10+0',
      eco: null,
      playedAt: null
    });
    const analysis = await analysesRepo.insertQueued(db, game.id);
    await analysesRepo.markReady(db, analysis.id);
    await analysesRepo.storeCoachingPlan(db, analysis.id, PLAN);
    return { user, session: await coachAgent.createSession(db, user.id, game.id) };
  }

  async function fresh(sessionId: string) {
    const session = await sessionsRepo.findById(db, sessionId);
    if (!session) throw new Error('session vanished');
    return session;
  }

  async function lastRequest(sessionId: string) {
    const snapshot = await coachAgent.getLastTurnDebugSnapshot(db, sessionId);
    if (!snapshot) throw new Error('no snapshot');
    return {
      instructions: snapshot.request.instructions.map((message) => String((message as { content: unknown }).content)).join('\n\n'),
      messages: JSON.stringify(snapshot.request.messages),
      tools: snapshot.request.tools.map((entry) => entry.name)
    };
  }

  test('a new coaching session opens in the progress check-in, seeded with a message that has no ply', async () => {
    const { session } = await seedSession();

    expect(session.phase).toBe('progress_open');
    const [seed] = await sessionMessagesRepo.listForPhase(db, session.id, 'progress_open');
    expect(seed).toMatchObject({ content: '[session_start]', ply: null });
    expect(await sessionMessagesRepo.listForPhase(db, session.id, 'review')).toEqual([]);
  });

  test('the check-in reads the progress dossier and no game, with only its own tools, and its messages carry no ply', async () => {
    const { session } = await seedSession();
    const model = multiStepModel([{ text: 'Daniel. Sit.', toolCall: { toolCallId: 'call-begin-review', toolName: 'begin_review', input: {} }, finishReason: 'tool-calls' }]);

    await drain(await coachAgent.startTurn(deps(model), session, {}));

    const request = await lastRequest(session.id);
    expect(request.instructions).toContain('## Progress dossier');
    expect(request.instructions).not.toContain('## This game (annotated)');
    expect(request.messages).not.toContain('You are now discussing');
    expect(request.tools).toContain('begin_review');
    expect(request.tools).not.toContain('show_position');
    const stored = await sessionMessagesRepo.listForPhase(db, session.id, 'progress_open');
    expect(stored.length).toBeGreaterThan(1);
    expect(stored.every((row) => row.ply === null)).toBe(true);
    expect(await sessionMessagesRepo.listForPhase(db, session.id, 'review')).toEqual([]);
  }, 20000);

  test('begin_review starts the review as a fresh episode that shares nothing with the check-in', async () => {
    const { session } = await seedSession();
    await drain(await coachAgent.startTurn(deps(multiStepModel([{ text: 'Daniel. Sit.', toolCall: { toolCallId: 'call-br', toolName: 'begin_review', input: {} }, finishReason: 'tool-calls' }])), session, {}));

    const review = await fresh(session.id);
    await drain(
      await coachAgent.startTurn(deps(multiStepModel([{ text: 'On to the game.', finishReason: 'stop' }])), review, {
        clientToolResult: { toolCallId: 'call-br', toolName: 'begin_review', result: { acknowledged: true } }
      })
    );

    expect((await fresh(session.id)).phase).toBe('review');
    const request = await lastRequest(session.id);
    expect(request.instructions).toContain('## This game (annotated)');
    expect(request.instructions).toContain('## Progress notes for this game');
    expect(request.messages).toContain('[review_start]');
    expect(request.messages).not.toContain('Daniel. Sit.');
    expect(request.tools).toContain('note_progress');
    expect(request.tools).not.toContain('end_session');
    expect(request.tools).not.toContain('propose_focus_area_update');
  }, 30000);

  test('begin_wrap_up closes the review and starts the closing round: its own notes, the progress notes, a closing note, none of the review\'s raw messages', async () => {
    const { session } = await seedSession();
    await sessionsRepo.setPhase(db, session.id, 'review');
    await db.updateTable('sessionMessages').set({ phase: 'review', ply: 0 }).where('sessionId', '=', session.id).execute();

    const reviewTurn = multiStepModel([
      { toolCall: { toolCallId: 'call-note', toolName: 'note_progress', input: { diagnosisCode: 'BV-04', note: 'Scanned for loose pieces unprompted.' } }, finishReason: 'tool-calls' },
      { text: 'Let us write it down.', toolCall: { toolCallId: 'call-wrap', toolName: 'begin_wrap_up', input: {} }, finishReason: 'tool-calls' }
    ]);
    await drain(await coachAgent.startTurn(deps(reviewTurn), await fresh(session.id), { content: 'counting the attackers' }));

    await drain(
      await coachAgent.startTurn(deps(multiStepModel([{ text: 'Here is what moved.', finishReason: 'stop' }])), await fresh(session.id), {
        clientToolResult: { toolCallId: 'call-wrap', toolName: 'begin_wrap_up', result: { acknowledged: true } }
      })
    );

    expect((await fresh(session.id)).phase).toBe('progress_close');
    const request = await lastRequest(session.id);
    expect(request.instructions).toContain('Scanned for loose pieces unprompted.');
    expect(request.instructions).toContain('## Other moves discussed');
    expect(request.instructions).toContain('This is the closing note about the game and about keeping the student\'s progress.');
    expect(request.messages).toContain('[wrap_up_start]');
    expect(request.messages).not.toContain('counting the attackers');
    expect(request.tools).toEqual(expect.arrayContaining(['end_session', 'save_progress_notes', 'propose_focus_area_update']));
    expect(request.tools).not.toContain('show_position');
  }, 40000);

  test('a phase result that does not match the round the session is in changes nothing', async () => {
    const { session } = await seedSession();

    await drain(
      await coachAgent.startTurn(deps(multiStepModel([{ text: 'Still here.', finishReason: 'stop' }])), session, {
        clientToolResult: { toolCallId: 'call-stale', toolName: 'begin_wrap_up', result: { acknowledged: true } }
      })
    );

    expect((await fresh(session.id)).phase).toBe('progress_open');
  }, 20000);
});

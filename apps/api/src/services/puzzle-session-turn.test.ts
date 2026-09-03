import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { drain, instantTextModel, mockResolution, multiStepModel } from '../../test/helpers/mock-model.js';
import * as creditsRepo from '../db/repositories/credits.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { InsufficientCreditsError } from '../lib/errors.js';
import { createKeyVault } from '../llm/key-vault.js';
import type { GatewayConfig } from '../llm/gateway.js';
import { startPuzzleTurn, type PuzzleTurnDependencies } from './puzzle-session-turn.js';

describe('startPuzzleTurn (Task 59.4)', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  const gatewayConfig: GatewayConfig = {
    keyVault: createKeyVault(Buffer.alloc(32, 7).toString('base64')),
    platformKeys: { anthropic: 'platform-key' },
    modelIds: {
      standard: { anthropic: 'claude-standard', openai: 'gpt-standard' },
      light: { anthropic: 'claude-light', openai: 'gpt-light' }
    }
  };

  async function makeAssignmentAndSession(twoItems = false) {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    await creditsRepo.insertSignupGrant(db, user.id);
    const assignment = await puzzleAssignmentsRepo.insert(db, {
      userId: user.id,
      diagnosisCode: 'TA-07',
      reason: 'Practice for knight forks.',
      items: [
        {
          puzzleId: 'abcd1',
          fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
          moves: ['e1e2', 'f6g4'],
          rating: 1500,
          themes: ['fork'],
          result: 'pending'
        },
        ...(twoItems
          ? [
              {
                puzzleId: 'efgh2',
                fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 4',
                moves: ['f3g5', 'd8g5'],
                rating: 1500,
                themes: ['fork'],
                result: 'pending' as const
              }
            ]
          : [])
      ]
    });
    const session = await puzzleSessionsRepo.insertSession(db, { assignmentId: assignment.id, userId: user.id });
    return { user, assignment, session };
  }

  test('an opening turn (no content, empty history) still produces a real reply and persists it', async () => {
    const { session } = await makeAssignmentAndSession();
    const model = instantTextModel('Welcome! Let\'s look at this position together.');
    const deps: PuzzleTurnDependencies = { db, gatewayConfig, resolveModel: () => Promise.resolve(mockResolution(model)) };

    const turn = await startPuzzleTurn(deps, session, {});
    await drain(turn);

    const messages = await puzzleSessionsRepo.listMessagesBySession(db, session.id);
    // The synthesized opening-turn content is never persisted — only the
    // model's own reply.
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe('assistant');
  });

  test('student content is persisted before the model call and appears in history', async () => {
    const { session } = await makeAssignmentAndSession();
    const model = instantTextModel('Good idea — try it.');
    const deps: PuzzleTurnDependencies = { db, gatewayConfig, resolveModel: () => Promise.resolve(mockResolution(model)) };

    const turn = await startPuzzleTurn(deps, session, { content: 'I think Nxe5 works here.' });
    await drain(turn);

    const messages = await puzzleSessionsRepo.listMessagesBySession(db, session.id);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('user');
    expect(messages[1]?.role).toBe('assistant');
  });

  test('a client tool result (e.g. hypothetical_line) is persisted as a tool message', async () => {
    const { session } = await makeAssignmentAndSession();
    const model = instantTextModel('I see.');
    const deps: PuzzleTurnDependencies = { db, gatewayConfig, resolveModel: () => Promise.resolve(mockResolution(model)) };

    const turn = await startPuzzleTurn(deps, session, {
      clientToolResult: { toolCallId: 'call-1', toolName: 'hypothetical_line', result: { resultFen: 'fen-after' } }
    });
    await drain(turn);

    const messages = await puzzleSessionsRepo.listMessagesBySession(db, session.id);
    expect(messages[0]?.role).toBe('tool');
  });

  test('advance_puzzle on a non-final item advances current_item_index without completing the session or assignment', async () => {
    const { session, assignment } = await makeAssignmentAndSession(true);
    const model = multiStepModel([
      { toolCall: { toolCallId: 'call-1', toolName: 'advance_puzzle', input: { result: 'solved' } }, finishReason: 'tool-calls' }
    ]);
    const deps: PuzzleTurnDependencies = { db, gatewayConfig, resolveModel: () => Promise.resolve(mockResolution(model)) };

    const turn = await startPuzzleTurn(deps, session, {});
    await drain(turn);

    const updatedSession = await puzzleSessionsRepo.findSessionById(db, session.id);
    expect(updatedSession?.currentItemIndex).toBe(1);
    expect(updatedSession?.status).toBe('active');
    const updatedAssignment = await puzzleAssignmentsRepo.findById(db, assignment.id);
    expect(updatedAssignment?.items[0]?.result).toBe('solved');
    expect(updatedAssignment?.status).toBe('pending');
  });

  test('advance_puzzle on the final item completes both the session and the assignment', async () => {
    const { session, assignment } = await makeAssignmentAndSession(false);
    const model = multiStepModel([
      { toolCall: { toolCallId: 'call-1', toolName: 'advance_puzzle', input: { result: 'failed' } }, finishReason: 'tool-calls' }
    ]);
    const deps: PuzzleTurnDependencies = { db, gatewayConfig, resolveModel: () => Promise.resolve(mockResolution(model)) };

    const turn = await startPuzzleTurn(deps, session, {});
    await drain(turn);

    const updatedSession = await puzzleSessionsRepo.findSessionById(db, session.id);
    expect(updatedSession?.status).toBe('completed');
    expect(updatedSession?.endedAt).not.toBeNull();
    const updatedAssignment = await puzzleAssignmentsRepo.findById(db, assignment.id);
    expect(updatedAssignment?.status).toBe('completed');
    expect(updatedAssignment?.items[0]?.result).toBe('failed');
  });

  test('no credits: pauses the session and throws InsufficientCreditsError, never calls the model', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Broke' });
    // No signup grant — balance is 0.
    const assignment = await puzzleAssignmentsRepo.insert(db, {
      userId: user.id,
      diagnosisCode: 'TA-07',
      reason: 'Practice for knight forks.',
      items: [
        {
          puzzleId: 'abcd1',
          fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
          moves: ['e1e2', 'f6g4'],
          rating: 1500,
          themes: ['fork'],
          result: 'pending'
        }
      ]
    });
    const session = await puzzleSessionsRepo.insertSession(db, { assignmentId: assignment.id, userId: user.id });
    const model = instantTextModel('should never run');
    const deps: PuzzleTurnDependencies = { db, gatewayConfig, resolveModel: () => Promise.resolve(mockResolution(model)) };

    await expect(startPuzzleTurn(deps, session, {})).rejects.toThrow(InsufficientCreditsError);

    const updated = await puzzleSessionsRepo.findSessionById(db, session.id);
    expect(updated?.status).toBe('paused_no_credits');
  });

  test('a metered turn debits the credit ledger', async () => {
    const { session, user } = await makeAssignmentAndSession();
    const balanceBefore = await creditsRepo.balance(db, user.id);
    const model = instantTextModel('ok');
    const deps: PuzzleTurnDependencies = { db, gatewayConfig, resolveModel: () => Promise.resolve(mockResolution(model)) };

    const turn = await startPuzzleTurn(deps, session, {});
    await drain(turn);

    const balanceAfter = await creditsRepo.balance(db, user.id);
    expect(balanceAfter).toBeLessThan(balanceBefore);
  });
});

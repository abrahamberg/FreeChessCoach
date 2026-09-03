import type { Kysely } from 'kysely';
import { MockLanguageModelV4 } from 'ai/test';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildApp } from '../app.js';
import * as creditsRepo from '../db/repositories/credits.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createKeyVault } from '../llm/key-vault.js';
import type { GatewayConfig } from '../llm/gateway.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { instantTextModel, mockResolution, multiStepModel } from '../../test/helpers/mock-model.js';
import type { CoachAgentBaseDependencies } from '../bootstrap.js';
import { noopJobQueue } from '../jobs/queue.js';

describe('puzzle-sessions routes (Task 59.4)', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;
  const keyVault = createKeyVault(Buffer.alloc(32, 7).toString('base64'));

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  function headersFor(user: { email: string; displayName: string }) {
    return { 'x-auth-request-email': user.email, 'x-auth-request-user': user.displayName };
  }

  function coachAgentBaseDeps(model: MockLanguageModelV4): CoachAgentBaseDependencies {
    const gatewayConfig: GatewayConfig = {
      keyVault,
      platformKeys: { anthropic: 'platform-key' },
      modelIds: {
        standard: { anthropic: 'claude-standard', openai: 'gpt-standard' },
        light: { anthropic: 'claude-light', openai: 'gpt-light' }
      }
    };
    return {
      db,
      jobQueue: noopJobQueue,
      gatewayConfig,
      callLightModel: async () => 'unused',
      resolveModel: () => Promise.resolve(mockResolution(model))
    };
  }

  async function setupAssignment(email: string) {
    const user = await usersRepo.insert(db, { email, displayName: 'Ann' });
    await creditsRepo.insertSignupGrant(db, user.id);
    const assignment = await puzzleAssignmentsRepo.insert(db, {
      userId: user.id,
      diagnosisCode: 'TA-07',
      reason: 'You missed several knight forks recently.',
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
    return { user, assignment };
  }

  test('POST /api/puzzle-sessions creates a session for the assignment', async () => {
    const { user, assignment } = await setupAssignment('create@example.com');
    const app = buildApp({ authMode: 'proxy', db, coachAgentBaseDeps: coachAgentBaseDeps(instantTextModel('x')) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/puzzle-sessions',
      headers: headersFor(user),
      payload: { assignmentId: assignment.id }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().assignmentId).toBe(assignment.id);
    expect(response.json().status).toBe('active');
  });

  test('POST /api/puzzle-sessions resumes instead of duplicating an active session', async () => {
    const { user, assignment } = await setupAssignment('resume@example.com');
    const app = buildApp({ authMode: 'proxy', db, coachAgentBaseDeps: coachAgentBaseDeps(instantTextModel('x')) });

    const first = await app.inject({
      method: 'POST',
      url: '/api/puzzle-sessions',
      headers: headersFor(user),
      payload: { assignmentId: assignment.id }
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/puzzle-sessions',
      headers: headersFor(user),
      payload: { assignmentId: assignment.id }
    });

    expect(second.json().id).toBe(first.json().id);
  });

  test('POST /api/puzzle-sessions 404s for an assignment belonging to another user', async () => {
    const { assignment } = await setupAssignment('owner@example.com');
    const stranger = await usersRepo.insert(db, { email: 'stranger@example.com', displayName: 'S' });
    const app = buildApp({ authMode: 'proxy', db, coachAgentBaseDeps: coachAgentBaseDeps(instantTextModel('x')) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/puzzle-sessions',
      headers: headersFor(stranger),
      payload: { assignmentId: assignment.id }
    });

    expect(response.statusCode).toBe(404);
  });

  test('GET /api/puzzle-sessions/:id returns the session with its assignment', async () => {
    const { user, assignment } = await setupAssignment('detail@example.com');
    const app = buildApp({ authMode: 'proxy', db, coachAgentBaseDeps: coachAgentBaseDeps(instantTextModel('x')) });
    const created = await app.inject({
      method: 'POST',
      url: '/api/puzzle-sessions',
      headers: headersFor(user),
      payload: { assignmentId: assignment.id }
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/puzzle-sessions/${created.json().id}`,
      headers: headersFor(user)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().assignment.id).toBe(assignment.id);
    expect(response.json().messages).toEqual([]);
  });

  test('POST /api/puzzle-sessions/:id/messages streams a reply and persists it', async () => {
    const { user, assignment } = await setupAssignment('messages@example.com');
    const app = buildApp({ authMode: 'proxy', db, coachAgentBaseDeps: coachAgentBaseDeps(instantTextModel('Let\'s look at this position.')) });
    const created = await app.inject({
      method: 'POST',
      url: '/api/puzzle-sessions',
      headers: headersFor(user),
      payload: { assignmentId: assignment.id }
    });

    const streamResponse = await app.inject({
      method: 'POST',
      url: `/api/puzzle-sessions/${created.json().id}/messages`,
      headers: headersFor(user),
      payload: {}
    });

    expect(streamResponse.statusCode).toBe(200);
    expect(streamResponse.payload).toContain('this position');

    const detail = await app.inject({
      method: 'GET',
      url: `/api/puzzle-sessions/${created.json().id}`,
      headers: headersFor(user)
    });
    expect(detail.json().messages).toHaveLength(1);
  }, 15000);

  test('advance_puzzle on the last item completes the session end-to-end through the route', async () => {
    const { user, assignment } = await setupAssignment('advance@example.com');
    const model = multiStepModel([
      { toolCall: { toolCallId: 'call-1', toolName: 'advance_puzzle', input: { result: 'solved' } }, finishReason: 'tool-calls' }
    ]);
    const app = buildApp({ authMode: 'proxy', db, coachAgentBaseDeps: coachAgentBaseDeps(model) });
    const created = await app.inject({
      method: 'POST',
      url: '/api/puzzle-sessions',
      headers: headersFor(user),
      payload: { assignmentId: assignment.id }
    });

    await app.inject({
      method: 'POST',
      url: `/api/puzzle-sessions/${created.json().id}/messages`,
      headers: headersFor(user),
      payload: {}
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/puzzle-sessions/${created.json().id}`,
      headers: headersFor(user)
    });
    expect(detail.json().status).toBe('completed');
  }, 15000);
});

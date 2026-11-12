import { buildAnnotatedPgn } from '@freechesscoach/chess-analysis';
import { SharedReviewSchema } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildTestApp } from '../../test/helpers/build-app.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { buildGameReportFixture } from '../../test/helpers/game-report-fixture.js';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';

const PGN = `[Event "Club night"]
[Site "https://www.chess.com/game/live/123"]
[White "Ann"]
[Black "Bob"]
[WhiteElo "1210"]
[Result "1-0"]

1. e4 {[%clk 0:09:58]} e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

let testDb: TestDb;
let db: Kysely<Database>;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
}, 120000);
afterAll(async () => {
  await testDb.cleanup();
});

function headersFor(email: string) {
  return { 'x-forwarded-email': email, 'x-forwarded-user': email };
}

/** A reviewed game: Black's 3...Nf6 is the blunder. */
async function insertReviewedGame(email: string, withReport = true): Promise<string> {
  const owner = await usersRepo.insert(db, { email, displayName: email });
  const game = await gamesRepo.insert(db, {
    userId: owner.id, pgn: PGN, source: 'paste', userColor: 'black', whiteName: 'Ann', blackName: 'Bob', result: '1-0', timeControl: null, eco: null, playedAt: null
  });
  const move = { cpLoss: 0, bestLineSan: [], evalAfterCp: 0, hangsPiece: false };
  await gamesRepo.updateAnnotatedPgn(db, game.id, buildAnnotatedPgn(PGN, new Map([
    [5, { ...move, quality: 'good' as const }],
    [6, { ...move, quality: 'blunder' as const, cpLoss: 900 }],
    [7, { ...move, quality: 'best' as const }]
  ])));
  const analysis = await analysesRepo.insertQueued(db, game.id);
  if (withReport) await analysesRepo.storeGameReport(db, analysis.id, buildGameReportFixture());
  return game.id;
}

describe('review share links', () => {
  test('the owner shares a review; anyone opens it with no login, without the account or the extra headers; turning it off ends the link', async () => {
    const app = buildTestApp({ db, authMode: 'proxy' });
    const owner = headersFor('sharer@example.com');
    const gameId = await insertReviewedGame('sharer@example.com');

    expect((await app.inject({ method: 'GET', url: `/api/games/${gameId}/share`, headers: owner })).json()).toEqual({ token: null });
    const shared = await app.inject({ method: 'POST', url: `/api/games/${gameId}/share`, headers: owner });
    expect(shared.statusCode).toBe(200);
    const { token } = shared.json<{ token: string }>();
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    // Sharing again keeps the same link.
    expect((await app.inject({ method: 'POST', url: `/api/games/${gameId}/share`, headers: owner })).json()).toEqual({ token });

    // No identity headers: a logged-out visitor.
    const review = await app.inject({ method: 'GET', url: `/api/public/shared-reviews/${token}` });
    expect(review.statusCode).toBe(200);
    const body = SharedReviewSchema.parse(review.json());
    expect(body).toMatchObject({ userColor: 'black', whiteName: 'Ann', blackName: 'Bob', keyPly: 6 });
    expect(body.pgn).toContain('[White "Ann"]');
    expect(body.pgn).not.toMatch(/chess\.com|Club night|1210|clk/);
    expect(review.body).not.toContain('sharer@example.com');

    const card = await app.inject({ method: 'GET', url: `/s/${token}`, headers: { host: 'freechesscoach.org' } });
    expect(card.statusCode).toBe(200);
    expect(card.headers['content-type']).toContain('text/html');
    expect(card.body).toContain(`<meta property="og:image" content="https://freechesscoach.org/api/public/shared-reviews/${token}/image.png">`);
    expect(card.body).toContain(`url=/shared/${token}`);

    const image = await app.inject({ method: 'GET', url: `/api/public/shared-reviews/${token}/image.png` });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.rawPayload.subarray(1, 4).toString()).toBe('PNG');

    expect((await app.inject({ method: 'DELETE', url: `/api/games/${gameId}/share`, headers: owner })).statusCode).toBe(204);
    for (const url of [`/api/public/shared-reviews/${token}`, `/s/${token}`, `/api/public/shared-reviews/${token}/image.png`]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
    // A new share is a new link: the old one stays dead.
    const again = (await app.inject({ method: 'POST', url: `/api/games/${gameId}/share`, headers: owner })).json<{ token: string }>();
    expect(again.token).not.toBe(token);
  });

  test("only the owner can share or stop sharing, the owner routes need a login, and a review that is not ready can't be shared", async () => {
    const app = buildTestApp({ db, authMode: 'proxy' });
    const gameId = await insertReviewedGame('owner2@example.com');
    const stranger = headersFor('stranger@example.com');
    expect((await app.inject({ method: 'POST', url: `/api/games/${gameId}/share`, headers: stranger })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/games/${gameId}/share`, headers: stranger })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/games/${gameId}/share`, headers: stranger })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/api/games/${gameId}/share` })).statusCode).toBe(401);

    const unready = await insertReviewedGame('owner3@example.com', false);
    expect((await app.inject({ method: 'POST', url: `/api/games/${unready}/share`, headers: headersFor('owner3@example.com') })).statusCode).toBe(400);

    for (const url of ['/api/public/shared-reviews/not-a-token', '/s/AAAAAAAAAAAAAAAAAAAAAA', '/s/..%2Fapi%2Fgames']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
  });
});

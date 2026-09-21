import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Kysely } from 'kysely';
import pg from 'pg';
import { createDb } from '../../src/db/index.js';
import { migrateToLatest } from '../../src/db/migrate.js';
import type { Database } from '../../src/db/schema.js';

export interface TestDb {
  db: Kysely<Database>;
  connectionString: string;
  cleanup: () => Promise<void>;
}

const TEMPLATE_DB_NAME = 'fcc_test_template';

async function ensureTemplateDb(baseUri: string, adminClient: pg.Client): Promise<void> {
  const res = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEMPLATE_DB_NAME]);
  if (res.rowCount === 0) {
    try {
      await adminClient.query(`CREATE DATABASE "${TEMPLATE_DB_NAME}"`);
      const templateUrl = new URL(baseUri);
      templateUrl.pathname = `/${TEMPLATE_DB_NAME}`;
      const templateDb = createDb(templateUrl.toString());
      await migrateToLatest(templateDb);
      await templateDb.destroy();
    } catch (err: unknown) {
      // 42P04 is duplicate_database in PostgreSQL (handled if created concurrently)
      if ((err as { code?: string }).code !== '42P04') throw err;
    }
  }
}

/**
 * Creates an isolated, pre-migrated Postgres database for a test suite.
 *
 * When `TEST_DATABASE_URL` is available (set by global-setup or an existing Postgres instance),
 * it clones from `fcc_test_template` via `CREATE DATABASE ... TEMPLATE` in ~15-25ms.
 * Otherwise, it falls back to a standalone container for the suite.
 */
export async function createTestDb(): Promise<TestDb> {
  const baseUri = process.env.TEST_DATABASE_URL;

  if (baseUri) {
    const adminUrl = new URL(baseUri);
    adminUrl.pathname = '/postgres';
    const adminClient = new pg.Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();

    await ensureTemplateDb(baseUri, adminClient);

    const suiteDbName = `test_${crypto.randomUUID().replace(/-/g, '')}`;
    await adminClient.query(`CREATE DATABASE "${suiteDbName}" TEMPLATE "${TEMPLATE_DB_NAME}"`);
    await adminClient.end();

    const suiteUrl = new URL(baseUri);
    suiteUrl.pathname = `/${suiteDbName}`;
    const connectionString = suiteUrl.toString();
    const db = createDb(connectionString);

    return {
      db,
      connectionString,
      cleanup: async () => {
        await db.destroy();
        const cleanupClient = new pg.Client({ connectionString: adminUrl.toString() });
        await cleanupClient.connect();
        await cleanupClient.query(`DROP DATABASE IF EXISTS "${suiteDbName}" WITH (FORCE)`);
        await cleanupClient.end();
      }
    };
  }

  // Fallback: standalone container if no shared database URL is configured
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
  const connectionString = container.getConnectionUri();
  const db = createDb(connectionString);
  await migrateToLatest(db);

  return {
    db,
    connectionString,
    cleanup: async () => {
      await db.destroy();
      await container.stop();
    }
  };
}

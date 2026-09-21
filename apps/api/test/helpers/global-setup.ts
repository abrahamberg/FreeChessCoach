import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { createDb } from '../../src/db/index.js';
import { migrateToLatest } from '../../src/db/migrate.js';

let container: StartedPostgreSqlContainer | null = null;

export async function setup(): Promise<void> {
  let baseUri = process.env.TEST_DATABASE_URL;

  if (!baseUri) {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    baseUri = container.getConnectionUri();
    process.env.TEST_DATABASE_URL = baseUri;
  }

  const adminUrl = new URL(baseUri);
  adminUrl.pathname = '/postgres';
  const adminClient = new pg.Client({ connectionString: adminUrl.toString() });
  await adminClient.connect();

  const templateDbName = 'fcc_test_template';
  const res = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [templateDbName]);

  if (res.rowCount === 0) {
    await adminClient.query(`CREATE DATABASE "${templateDbName}"`);
    const templateUrl = new URL(baseUri);
    templateUrl.pathname = `/${templateDbName}`;
    const templateDb = createDb(templateUrl.toString());
    await migrateToLatest(templateDb);
    await templateDb.destroy();
  }

  await adminClient.end();
}

export async function teardown(): Promise<void> {
  if (container) {
    await container.stop();
    container = null;
  }
}

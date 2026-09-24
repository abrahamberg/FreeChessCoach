import { sql, type Kysely } from 'kysely';

/** Task 77.2: the `deepen-analysis` job is gone (it re-sent every position of
 * a game to the engine and threw the results away), so any still-queued row
 * would only fail with "no task handler". graphile-worker's `jobs` is a view;
 * the rows live in `_private_jobs`. Guarded because graphile-worker creates
 * its schema on first start, which may come after this migration runs. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    DO $$
    BEGIN
      IF to_regclass('graphile_worker._private_jobs') IS NOT NULL
        AND to_regclass('graphile_worker._private_tasks') IS NOT NULL THEN
        DELETE FROM graphile_worker._private_jobs j
        USING graphile_worker._private_tasks t
        WHERE t.id = j.task_id AND t.identifier = 'deepen-analysis';
      END IF;
    END
    $$
  `.execute(db);
}

/** Deleted jobs are not restored: there is no handler left to run them. */
export async function down(): Promise<void> {
  // Nothing to undo.
}

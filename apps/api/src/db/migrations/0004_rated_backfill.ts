import { sql, type Kysely } from 'kysely';

/** Pattern tracking counts only `rated` games at one exact `time_control`.
 * Two kinds of game never qualified, so a user's first 15 showed as 0:
 *  - Chess.com PGNs carry no rated tag, so imports stored `rated = NULL`;
 *    they are treated as rated (an unrated live game is the rare case).
 *  - Bot games stored no `rated` and a minutes label ("10+0") that could not
 *    match an imported "600+0". 10-minute bot games now count as rated, with
 *    the same seconds-based label the imports use. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`UPDATE games SET rated = true WHERE source = 'chesscom' AND rated IS NULL`.execute(db);
  await sql`
    UPDATE games
       SET rated = true,
           time_control = (clock_initial_ms / 1000)::text || '+' || (clock_increment_ms / 1000)::text
     WHERE source = 'vs_bot' AND clock_initial_ms = 600000 AND clock_increment_ms IS NOT NULL
  `.execute(db);
}

export async function down(): Promise<void> {
  // Data backfill; the previous NULL/label values are not recoverable.
}

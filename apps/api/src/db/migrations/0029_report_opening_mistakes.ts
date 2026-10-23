import { openingMistakeCount, parseAnnotatedPgn } from '@freechesscoach/chess-analysis';
import { sql, type Kysely } from 'kysely';

// Each row carries the game's annotated PGN (hundreds of KB), so a small page.
const BATCH_SIZE = 50;

interface ReportSource {
  id: string;
  pgn: string | null;
  colour: 'white' | 'black';
}

/** `PlayerReport.openingMistakes`: the stats dashboard counted each player's
 * opening mistakes off the game's annotated PGN on every read, decoding every
 * game the user has. The count now lives in the stored report; this writes it
 * into every report stored before, from the same annotated moves. */
export async function up(db: Kysely<unknown>): Promise<void> {
  let afterId = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const { rows } = await sql<ReportSource>`
      SELECT a.id, g.annotated_pgn AS pgn, g.user_color AS colour
        FROM analyses a JOIN games g ON g.id = a.game_id
       WHERE a.game_report IS NOT NULL AND a.id > ${afterId}
       ORDER BY a.id
       LIMIT ${BATCH_SIZE}
    `.execute(db);
    for (const row of rows) await writeOpeningMistakes(db, row);
    const last = rows.at(-1);
    if (!last || rows.length < BATCH_SIZE) return;
    afterId = last.id;
  }
}

async function writeOpeningMistakes(db: Kysely<unknown>, row: ReportSource): Promise<void> {
  const moves = row.pgn ? parseAnnotatedPgn(row.pgn, row.colour) : [];
  const white = openingMistakeCount(moves, 'white');
  const black = openingMistakeCount(moves, 'black');
  await sql`
    UPDATE analyses
       SET game_report = jsonb_set(
             jsonb_set(game_report, '{players,white,openingMistakes}', to_jsonb(${white}::int)),
             '{players,black,openingMistakes}', to_jsonb(${black}::int))
     WHERE id = ${row.id}
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE analyses
       SET game_report = game_report #- '{players,white,openingMistakes}' #- '{players,black,openingMistakes}'
     WHERE game_report IS NOT NULL
  `.execute(db);
}

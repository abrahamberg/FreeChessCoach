import { sql, type Kysely } from 'kysely';

/** Consolidated initial schema — replaces migrations 0001–0043.
 *  This is the single installation point; no backwards compatibility. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.execute(db);

  // users
  await sql`
    CREATE TABLE users (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email              text UNIQUE NOT NULL,
      display_name       text NOT NULL,
      rating_band        text NOT NULL CHECK (rating_band IN
                               ('novice','improving','club','advanced')) DEFAULT 'improving',
      lichess_username   text,
      chesscom_username  text,
      self_assessment    text,
      engine_mode        text NOT NULL DEFAULT 'native'
                               CHECK (engine_mode IN ('native','browser','chess_api')),
      coach_persona      text NOT NULL DEFAULT 'general'
                               CHECK (coach_persona IN
                               ('general','general_female','commander','scholar','huntress','shark','sunzi','gambler')),
      tts_enabled        boolean NOT NULL DEFAULT false,
      tts_backend        text NOT NULL DEFAULT 'openai'
                               CHECK (tts_backend IN ('openai','browser')),
      rating             integer,
      rating_source      text CHECK (rating_source IN ('self','pgn','estimated')),
      created_at         timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  // user_llm_setups (replaces user_llm_keys)
  await sql`
    CREATE TABLE user_llm_setups (
      user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      setup_ciphertext   bytea NOT NULL,
      setup_iv           bytea NOT NULL,
      setup_salt         bytea NOT NULL,
      created_at         timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  // games
  await sql`
    CREATE TABLE games (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id              uuid NOT NULL REFERENCES users(id),
      pgn                  text NOT NULL,
      source               text NOT NULL CHECK (source IN
                               ('paste','upload','lichess','coach_play','vs_bot','chesscom')),
      user_color           text NOT NULL CHECK (user_color IN ('white','black')),
      white_name           text,
      black_name           text,
      result               text,
      time_control         text,
      eco                  text,
      played_at            timestamptz,
      created_at           timestamptz NOT NULL DEFAULT now(),
      bot_id               text,
      bot_config_snapshot  jsonb,
      clock_initial_ms     integer,
      clock_increment_ms   integer,
      white_remaining_ms   integer,
      black_remaining_ms   integer,
      white_elo            integer,
      black_elo            integer,
      ratings_provisional  boolean NOT NULL DEFAULT false,
      rated                boolean,
      termination          text,
      variant              text,
      speed                text CHECK (speed IN
                               ('bullet','blitz','rapid','classical','correspondence','unknown')),
      played_at_time       time,
      move_times           jsonb,
      review_tier          text NOT NULL DEFAULT 'imported'
                               CHECK (review_tier IN ('imported','bot','review','coach')),
      annotated_pgn        text,
      last_move_at         timestamptz,
      CONSTRAINT games_bot_columns_check
        CHECK ((source = 'vs_bot') = (bot_id IS NOT NULL AND bot_config_snapshot IS NOT NULL)),
      CONSTRAINT games_clock_columns_check
        CHECK (
          (clock_initial_ms IS NULL) = (clock_increment_ms IS NULL)
          AND (clock_initial_ms IS NULL) = (white_remaining_ms IS NULL)
          AND (clock_initial_ms IS NULL) = (black_remaining_ms IS NULL)
        )
    )
  `.execute(db);
  await sql`CREATE INDEX games_user_created ON games(user_id, created_at DESC)`.execute(db);

  // analyses
  await sql`
    CREATE TABLE analyses (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id           uuid UNIQUE NOT NULL REFERENCES games(id),
      status            text NOT NULL CHECK (status IN
                              ('queued','engine_running','planning','ready','failed','paused')),
      error             text,
      coaching_plan     jsonb,
      book_report       jsonb,
      game_report       jsonb,
      evals_computed    int NOT NULL DEFAULT 0,
      candidate_moments jsonb,
      created_at        timestamptz NOT NULL DEFAULT now(),
      completed_at      timestamptz
    )
  `.execute(db);

  // sessions
  await sql`
    CREATE TABLE sessions (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id              uuid NOT NULL REFERENCES games(id),
      user_id              uuid NOT NULL REFERENCES users(id),
      status               text NOT NULL CHECK (status IN
                               ('active','completed','abandoned')) DEFAULT 'active',
      current_ply          int NOT NULL DEFAULT 0,
      subject_ply          int NOT NULL DEFAULT 0,
      threads              jsonb NOT NULL DEFAULT '[]',
      debug_snapshot       jsonb,
      mode                 text NOT NULL DEFAULT 'analyze'
                               CHECK (mode IN ('analyze','play','play_bot')),
      bot_thinking_log     boolean NOT NULL DEFAULT false,
      summary              text,
      homework             text,
      started_at           timestamptz NOT NULL DEFAULT now(),
      ended_at             timestamptz
    )
  `.execute(db);

  // session_messages
  await sql`
    CREATE TABLE session_messages (
      id         bigserial PRIMARY KEY,
      session_id uuid NOT NULL REFERENCES sessions(id),
      role       text NOT NULL CHECK (role IN ('user','assistant','tool')),
      content    jsonb NOT NULL,
      ply        int,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  // session_move_notes
  await sql`
    CREATE TABLE session_move_notes (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id  uuid NOT NULL REFERENCES sessions(id),
      ply         int NOT NULL,
      note        text NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      UNIQUE (session_id, ply)
    )
  `.execute(db);

  // findings
  await sql`
    CREATE TABLE findings (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       uuid NOT NULL REFERENCES users(id),
      session_id    uuid REFERENCES sessions(id),
      game_id       uuid REFERENCES games(id),
      category      text NOT NULL,
      severity      text NOT NULL CHECK (severity IN ('minor','significant','critical')),
      ply           int,
      description   text NOT NULL,
      is_positive   boolean NOT NULL DEFAULT false,
      diagnosis_code text,
      mechanism     text CHECK (mechanism IN ('K','M','V','R','G','C','J','X','L','S')),
      direction     text CHECK (direction IN ('O','D','B','N')),
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX findings_user_category ON findings(user_id, category, created_at)`.execute(db);

  // focus_areas
  await sql`
    CREATE TABLE focus_areas (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        uuid NOT NULL REFERENCES users(id),
      category       text NOT NULL,
      diagnosis_code text,
      status         text NOT NULL CHECK (status IN ('active','improving','resolved')),
      note           text NOT NULL,
      evidence_count int NOT NULL DEFAULT 1,
      last_seen_at   timestamptz NOT NULL DEFAULT now(),
      created_at     timestamptz NOT NULL DEFAULT now(),
      is_primary     boolean NOT NULL DEFAULT false,
      UNIQUE (user_id, diagnosis_code)
    )
  `.execute(db);

  // diagnostic_observations
  await sql`
    CREATE TABLE diagnostic_observations (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      uuid NOT NULL REFERENCES users(id),
      game_id      uuid NOT NULL REFERENCES games(id),
      ply          int NOT NULL,
      code         text NOT NULL,
      direction    text NOT NULL CHECK (direction IN ('O','D','B','N')),
      failed       boolean NOT NULL,
      hwdl         double precision NOT NULL,
      severity     text NOT NULL CHECK (severity IN ('minor','meaningful','major','decisive')),
      reachability double precision NOT NULL,
      created_at   timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX diagnostic_observations_user_code ON diagnostic_observations(user_id, code, created_at)`.execute(db);
  await sql`CREATE INDEX diagnostic_observations_game ON diagnostic_observations(game_id)`.execute(db);

  // diagnostic_profiles
  await sql`
    CREATE TABLE diagnostic_profiles (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      uuid NOT NULL REFERENCES users(id),
      time_control text NOT NULL,
      window_start timestamptz NOT NULL,
      window_end   timestamptz NOT NULL,
      computed_at  timestamptz NOT NULL DEFAULT now(),
      profile      jsonb NOT NULL,
      UNIQUE (user_id, time_control, window_end)
    )
  `.execute(db);

  // puzzle_assignments
  await sql`
    CREATE TABLE puzzle_assignments (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        uuid NOT NULL REFERENCES users(id),
      diagnosis_code text NOT NULL,
      reason         text NOT NULL,
      items          jsonb NOT NULL,
      status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
      created_at     timestamptz NOT NULL DEFAULT now(),
      started_at     timestamptz,
      completed_at   timestamptz
    )
  `.execute(db);
  await sql`CREATE INDEX puzzle_assignments_user_status ON puzzle_assignments(user_id, status)`.execute(db);

  // puzzle_sessions
  await sql`
    CREATE TABLE puzzle_sessions (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id      uuid NOT NULL REFERENCES puzzle_assignments(id),
      user_id            uuid NOT NULL REFERENCES users(id),
      status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
      current_item_index int NOT NULL DEFAULT 0,
      current_ply        int NOT NULL DEFAULT 1,
      started_at         timestamptz NOT NULL DEFAULT now(),
      ended_at           timestamptz
    )
  `.execute(db);
  await sql`CREATE INDEX puzzle_sessions_assignment ON puzzle_sessions(assignment_id)`.execute(db);
  await sql`CREATE INDEX puzzle_sessions_user ON puzzle_sessions(user_id, status)`.execute(db);

  // puzzle_session_messages
  await sql`
    CREATE TABLE puzzle_session_messages (
      id                bigserial PRIMARY KEY,
      puzzle_session_id uuid NOT NULL REFERENCES puzzle_sessions(id),
      role              text NOT NULL CHECK (role IN ('user','assistant','tool')),
      content           jsonb NOT NULL,
      item_index        int,
      created_at        timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX puzzle_session_messages_session ON puzzle_session_messages(puzzle_session_id)`.execute(db);

  // stats_archive_weeks
  await sql`
    CREATE TABLE stats_archive_weeks (
      user_id    uuid NOT NULL REFERENCES users(id),
      week_start date NOT NULL,
      speed      text NOT NULL,
      bucket     jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, week_start, speed)
    )
  `.execute(db);

  // game_import_events
  await sql`
    CREATE TABLE game_import_events (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX game_import_events_user_created ON game_import_events(user_id, created_at)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS game_import_events`.execute(db);
  await sql`DROP TABLE IF EXISTS stats_archive_weeks`.execute(db);
  await sql`DROP TABLE IF EXISTS puzzle_session_messages`.execute(db);
  await sql`DROP TABLE IF EXISTS puzzle_sessions`.execute(db);
  await sql`DROP TABLE IF EXISTS puzzle_assignments`.execute(db);
  await sql`DROP TABLE IF EXISTS diagnostic_profiles`.execute(db);
  await sql`DROP INDEX IF EXISTS diagnostic_observations_game`.execute(db);
  await sql`DROP INDEX IF EXISTS diagnostic_observations_user_code`.execute(db);
  await sql`DROP TABLE IF EXISTS diagnostic_observations`.execute(db);
  await sql`DROP TABLE IF EXISTS focus_areas`.execute(db);
  await sql`DROP INDEX IF EXISTS findings_user_category`.execute(db);
  await sql`DROP TABLE IF EXISTS findings`.execute(db);
  await sql`DROP TABLE IF EXISTS session_move_notes`.execute(db);
  await sql`DROP TABLE IF EXISTS session_messages`.execute(db);
  await sql`DROP TABLE IF EXISTS sessions`.execute(db);
  await sql`DROP TABLE IF EXISTS analyses`.execute(db);
  await sql`DROP INDEX IF EXISTS games_user_created`.execute(db);
  await sql`DROP TABLE IF EXISTS games`.execute(db);
  await sql`DROP TABLE IF EXISTS user_llm_setups`.execute(db);
  await sql`DROP TABLE IF EXISTS users`.execute(db);
}
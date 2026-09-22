-- Drop all tables in the public schema (keeps database, users, permissions)
-- Run this BEFORE the 0000_consolidated_initial migration on an existing DB

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Disable triggers temporarily
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' DISABLE TRIGGER ALL';
  END LOOP;

  -- Drop all tables with CASCADE (handles FKs)
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;

  -- Drop all sequences
  FOR r IN (SELECT sequencename FROM pg_sequences WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP SEQUENCE IF EXISTS public.' || quote_ident(r.sequencename) || ' CASCADE';
  END LOOP;

  -- Drop all types (enums, etc.)
  FOR r IN (SELECT typname FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'public' AND t.typtype = 'e') LOOP
    EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
  END LOOP;

  -- Drop the migration tracking table if it exists (kysely_migration or similar)
  EXECUTE 'DROP TABLE IF EXISTS public.kysely_migration CASCADE';
  EXECUTE 'DROP TABLE IF EXISTS public.kysely_migration_lock CASCADE';
END $$;
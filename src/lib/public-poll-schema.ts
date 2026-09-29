import type Database from 'better-sqlite3';
export function runPublicPollMigration(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS public_polls (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
      question TEXT NOT NULL, options_json TEXT NOT NULL,
      created_by INTEGER NOT NULL REFERENCES admin_users(id),
      status TEXT NOT NULL CHECK(status IN ('draft','open','sealing','finalised','published')) DEFAULT 'draft',
      opens_at INTEGER NOT NULL, closes_at INTEGER NOT NULL, confirms_until INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public_poll_ballots (
      id TEXT PRIMARY KEY, poll_id TEXT NOT NULL REFERENCES public_polls(id),
      rankings_json TEXT NOT NULL, membership TEXT NOT NULL CHECK(membership IN ('yes','no','prefer_not')),
      confirmed INTEGER NOT NULL DEFAULT 0, accepted INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS public_poll_ballots_poll ON public_poll_ballots(poll_id);
    CREATE TABLE IF NOT EXISTS public_poll_claims (
      token_hash TEXT PRIMARY KEY, poll_id TEXT NOT NULL REFERENCES public_polls(id),
      email_key TEXT NOT NULL, sealed TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS public_poll_claims_email ON public_poll_claims(poll_id,email_key);
    CREATE TABLE IF NOT EXISTS public_poll_limits (
      poll_id TEXT NOT NULL, key TEXT NOT NULL, attempts INTEGER NOT NULL, resets_at INTEGER NOT NULL,
      PRIMARY KEY(poll_id,key)
    );
  `);
}

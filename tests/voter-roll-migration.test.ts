import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The migration SQL is extracted verbatim from src/lib/db.ts so this test
// cannot drift from what the app executes at startup.
const dbTsPath = fileURLToPath(new URL('../src/lib/db.ts', import.meta.url));
const dbTs = readFileSync(dbTsPath, 'utf8');
const sqlMatch = dbTs.match(/function migrateVoterRollUniqueness[\s\S]*?database\.exec\(`([\s\S]*?)`\);/);
if (!sqlMatch) throw new Error('could not extract migrateVoterRollUniqueness SQL from db.ts');
const MIGRATION_SQL = sqlMatch[1];

function tableSql(db: Database.Database, name: string): string {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) as { sql: string } | undefined;
  return row?.sql || '';
}

// Mirrors the guard + exec in db.ts migrateVoterRollUniqueness.
function migrateVoterRollUniqueness(db: Database.Database): 'applied' | 'skipped' {
  const sql = tableSql(db, 'voter_roll');
  if (!sql || sql.includes('UNIQUE(email, plebiscite_id)')) return 'skipped';
  db.exec(MIGRATION_SQL);
  return 'applied';
}

function applyAsApp(db: Database.Database): 'applied' | 'skipped' {
  // The app runs the rebuild with foreign keys off, inside a transaction.
  db.pragma('foreign_keys = OFF');
  const result = db.transaction(() => migrateVoterRollUniqueness(db))();
  db.pragma('foreign_keys = ON');
  return result;
}

describe('voter_roll per-election uniqueness migration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    // Legacy schema: global UNIQUE(email) plus the later plebiscite_id column.
    db.exec(`
      CREATE TABLE plebiscites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL
      );
      CREATE TABLE voter_roll (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE voter_roll ADD COLUMN plebiscite_id INTEGER REFERENCES plebiscites(id) ON DELETE CASCADE;
      CREATE TABLE participation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plebiscite_id INTEGER NOT NULL,
        voter_roll_id INTEGER NOT NULL,
        FOREIGN KEY (plebiscite_id) REFERENCES plebiscites (id) ON DELETE CASCADE,
        FOREIGN KEY (voter_roll_id) REFERENCES voter_roll (id) ON DELETE CASCADE,
        UNIQUE(plebiscite_id, voter_roll_id)
      );
      INSERT INTO plebiscites (slug, title) VALUES ('election-one', 'Election One');
      INSERT INTO plebiscites (slug, title) VALUES ('election-two', 'Election Two');
      INSERT INTO voter_roll (email, plebiscite_id) VALUES ('alice@example.com', 1);
      INSERT INTO voter_roll (email, plebiscite_id) VALUES ('bob@example.com', 1);
      INSERT INTO voter_roll (email, plebiscite_id) VALUES ('legacy@example.com', NULL);
      INSERT INTO participation (plebiscite_id, voter_roll_id) VALUES (1, 1);
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('reproduces the pre-migration bug: global UNIQUE blocks cross-election enrolment', () => {
    expect(() =>
      db.prepare('INSERT INTO voter_roll (email, plebiscite_id) VALUES (?, ?)').run('alice@example.com', 2)
    ).toThrow(/UNIQUE/);
  });

  it('applies once and is idempotent', () => {
    expect(applyAsApp(db)).toBe('applied');
    expect(applyAsApp(db)).toBe('skipped');
  });

  it('preserves all rows, IDs, and NULL-plebiscite legacy rows', () => {
    applyAsApp(db);
    const rows = db.prepare('SELECT id, email, plebiscite_id FROM voter_roll ORDER BY id').all() as any[];
    expect(rows).toEqual([
      { id: 1, email: 'alice@example.com', plebiscite_id: 1 },
      { id: 2, email: 'bob@example.com', plebiscite_id: 1 },
      { id: 3, email: 'legacy@example.com', plebiscite_id: null }
    ]);
  });

  it('keeps participation references valid', () => {
    applyAsApp(db);
    const joined = db.prepare(`
      SELECT v.email FROM participation p JOIN voter_roll v ON v.id = p.voter_roll_id
      WHERE p.plebiscite_id = 1
    `).all() as any[];
    expect(joined).toEqual([{ email: 'alice@example.com' }]);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('allows the same email in a second election but not twice in one election', () => {
    applyAsApp(db);
    const cross = db.prepare('INSERT OR IGNORE INTO voter_roll (email, plebiscite_id) VALUES (?, ?)').run('alice@example.com', 2);
    expect(cross.changes).toBe(1);

    const duplicate = db.prepare('INSERT OR IGNORE INTO voter_roll (email, plebiscite_id) VALUES (?, ?)').run('alice@example.com', 1);
    expect(duplicate.changes).toBe(0);

    expect(() =>
      db.prepare('INSERT INTO voter_roll (email, plebiscite_id) VALUES (?, ?)').run('bob@example.com', 1)
    ).toThrow(/UNIQUE/);
  });

  it('lets a legacy NULL-plebiscite email enrol in a real election, and continues AUTOINCREMENT', () => {
    applyAsApp(db);
    const result = db.prepare('INSERT INTO voter_roll (email, plebiscite_id) VALUES (?, ?)').run('legacy@example.com', 1);
    expect(result.changes).toBe(1);
    expect(Number(result.lastInsertRowid)).toBeGreaterThan(3);
  });
});

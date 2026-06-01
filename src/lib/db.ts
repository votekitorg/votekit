import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Only initialize database if not in build process
let db: Database.Database | null = null;

function getDatabase() {
  if (!db && process.env.NODE_ENV !== 'test' && typeof window === 'undefined') {
    const dbPath = process.env.DATABASE_PATH || './plebiscite.db';
    const dbDir = path.dirname(dbPath);

    // Ensure directory exists
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);

    // Enable foreign keys and WAL mode for better performance
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');

    // Run migrations
    runMigrations();
  }
  
  return db;
}

// Migration system
const migrations = [
  `
    CREATE TABLE IF NOT EXISTS plebiscites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      info_url TEXT,
      open_date DATETIME NOT NULL,
      close_date DATETIME NOT NULL,
      status TEXT CHECK(status IN ('draft', 'open', 'closed')) DEFAULT 'draft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plebiscite_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT CHECK(type IN ('yes_no', 'multiple_choice', 'ranked_choice', 'condorcet')) NOT NULL,
      options TEXT NOT NULL, -- JSON array
      display_order INTEGER NOT NULL,
      FOREIGN KEY (plebiscite_id) REFERENCES plebiscites (id) ON DELETE CASCADE
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS voter_roll (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      vote_data TEXT NOT NULL, -- JSON containing vote choices/rankings
      receipt_code TEXT UNIQUE NOT NULL,
      FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS participation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plebiscite_id INTEGER NOT NULL,
      voter_roll_id INTEGER NOT NULL,
      FOREIGN KEY (plebiscite_id) REFERENCES plebiscites (id) ON DELETE CASCADE,
      FOREIGN KEY (voter_roll_id) REFERENCES voter_roll (id) ON DELETE CASCADE,
      UNIQUE(plebiscite_id, voter_roll_id)
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_plebiscites_slug ON plebiscites(slug);
    CREATE INDEX IF NOT EXISTS idx_plebiscites_status ON plebiscites(status);
    CREATE INDEX IF NOT EXISTS idx_questions_plebiscite ON questions(plebiscite_id);
    CREATE INDEX IF NOT EXISTS idx_voter_roll_email ON voter_roll(email);
    CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);
    CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);
    CREATE INDEX IF NOT EXISTS idx_votes_question ON votes(question_id);
    CREATE INDEX IF NOT EXISTS idx_participation_plebiscite ON participation(plebiscite_id);
  `,
  `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      plebiscite_id INTEGER,
      is_admin BOOLEAN DEFAULT FALSE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);
  `,
  `
    ALTER TABLE questions ADD COLUMN preferential_type TEXT CHECK(preferential_type IN ('compulsory', 'optional')) DEFAULT 'compulsory';
  `,
  `
    CREATE TABLE IF NOT EXISTS admin_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS admin_login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_address TEXT NOT NULL,
      success BOOLEAN DEFAULT FALSE,
      attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      locked_until DATETIME NULL
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_admin_attempts_ip ON admin_login_attempts(ip_address);
    CREATE INDEX IF NOT EXISTS idx_admin_attempts_time ON admin_login_attempts(attempted_at);
  `,
  `
    CREATE TABLE IF NOT EXISTS email_rate_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      attempt_count INTEGER DEFAULT 1,
      reset_time DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_email_rate_email ON email_rate_limits(email);
    CREATE INDEX IF NOT EXISTS idx_email_rate_reset ON email_rate_limits(reset_time);
  `,
  `
    ALTER TABLE voter_roll ADD COLUMN plebiscite_id INTEGER REFERENCES plebiscites(id) ON DELETE CASCADE;
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_voter_roll_plebiscite ON voter_roll(plebiscite_id);
  `
];

// Apply migrations
function runMigrations() {
  const database = getDatabase();
  if (!database) return;
  
  const migrate = database.transaction(() => {
    migrations.forEach((migration, index) => {
      try {
        database.exec(migration);
        console.log(`Migration ${index + 1} applied successfully`);
      } catch (error: any) {
        if (error?.message?.includes('duplicate column name')) {
          console.log(`Migration ${index + 1} skipped (column already exists)`);
        } else {
          console.error(`Failed to apply migration ${index + 1}:`, error);
          throw error;
        }
      }
    });

  });
  
  migrate();
  runPrivacyMigrations(database);
}

function tableInfo(database: Database.Database, tableName: string): Array<{ name: string; type: string; notnull: number; dflt_value: any; pk: number }> {
  return database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string; type: string; notnull: number; dflt_value: any; pk: number }>;
}

function tableSql(database: Database.Database, tableName: string): string {
  const row = database.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).get(tableName) as { sql: string } | undefined;
  return row?.sql || '';
}

function hasColumn(database: Database.Database, tableName: string, columnName: string): boolean {
  return tableInfo(database, tableName).some(column => column.name === columnName);
}

function runPrivacyMigrations(database: Database.Database): void {
  const previousForeignKeys = (database.pragma('foreign_keys', { simple: true }) as number) === 1;
  database.pragma('foreign_keys = OFF');
  try {
    const migratePrivacy = database.transaction(() => {
      migrateQuestionsConstraint(database);
      migrateVotesPrivacy(database);
      migrateParticipationPrivacy(database);
    });

    migratePrivacy();
  } finally {
    if (previousForeignKeys) {
      database.pragma('foreign_keys = ON');
    }
  }
}

function migrateQuestionsConstraint(database: Database.Database): void {
  const sql = tableSql(database, 'questions');
  if (!sql || sql.includes("'condorcet'")) return;

  database.exec(`
    CREATE TABLE questions_privacy_migration (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plebiscite_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT CHECK(type IN ('yes_no', 'multiple_choice', 'ranked_choice', 'condorcet')) NOT NULL,
      options TEXT NOT NULL,
      display_order INTEGER NOT NULL,
      preferential_type TEXT CHECK(preferential_type IN ('compulsory', 'optional')) DEFAULT 'compulsory',
      FOREIGN KEY (plebiscite_id) REFERENCES plebiscites (id) ON DELETE CASCADE
    );

    INSERT INTO questions_privacy_migration (id, plebiscite_id, title, description, type, options, display_order, preferential_type)
    SELECT id, plebiscite_id, title, description, type, options, display_order,
           COALESCE(preferential_type, 'compulsory')
    FROM questions;

    DROP TABLE questions;
    ALTER TABLE questions_privacy_migration RENAME TO questions;
    CREATE INDEX IF NOT EXISTS idx_questions_plebiscite ON questions(plebiscite_id);
  `);
}

function migrateVotesPrivacy(database: Database.Database): void {
  if (!hasColumn(database, 'votes', 'created_at')) return;

  database.exec(`
    CREATE TABLE votes_privacy_migration (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      vote_data TEXT NOT NULL,
      receipt_code TEXT UNIQUE NOT NULL,
      FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
    );

    INSERT INTO votes_privacy_migration (id, question_id, vote_data, receipt_code)
    SELECT id, question_id, vote_data, receipt_code
    FROM votes;

    DROP TABLE votes;
    ALTER TABLE votes_privacy_migration RENAME TO votes;
    CREATE INDEX IF NOT EXISTS idx_votes_question ON votes(question_id);
  `);
}

function migrateParticipationPrivacy(database: Database.Database): void {
  if (!hasColumn(database, 'participation', 'receipt_codes') && !hasColumn(database, 'participation', 'voted_at')) return;

  database.exec(`
    CREATE TABLE participation_privacy_migration (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plebiscite_id INTEGER NOT NULL,
      voter_roll_id INTEGER NOT NULL,
      FOREIGN KEY (plebiscite_id) REFERENCES plebiscites (id) ON DELETE CASCADE,
      FOREIGN KEY (voter_roll_id) REFERENCES voter_roll (id) ON DELETE CASCADE,
      UNIQUE(plebiscite_id, voter_roll_id)
    );

    INSERT OR IGNORE INTO participation_privacy_migration (id, plebiscite_id, voter_roll_id)
    SELECT id, plebiscite_id, voter_roll_id
    FROM participation;

    DROP TABLE participation;
    ALTER TABLE participation_privacy_migration RENAME TO participation;
    CREATE INDEX IF NOT EXISTS idx_participation_plebiscite ON participation(plebiscite_id);
  `);
}

// Utility functions
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
}

export function generateUniqueSlug(title: string): string {
  const database = getDatabase();
  if (!database) return generateSlug(title);
  
  const baseSlug = generateSlug(title);
  const existing = database.prepare('SELECT COUNT(*) as count FROM plebiscites WHERE slug LIKE ?').get(`${baseSlug}%`) as { count: number };
  
  if (existing.count === 0) {
    return baseSlug;
  }
  
  return `${baseSlug}-${Date.now()}`;
}

export function generateReceiptCode(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function cleanupExpiredCodes(): void {
  const database = getDatabase();
  if (!database) return;
  
  database.prepare('DELETE FROM verification_codes WHERE expires_at < ? AND used = FALSE')
    .run(new Date().toISOString());
}

export function cleanupExpiredSessions(): void {
  const database = getDatabase();
  if (!database) return;
  
  database.prepare('DELETE FROM sessions WHERE expires_at < ?')
    .run(new Date().toISOString());
}

// Export a proxy that lazily initializes the database
const dbProxy = new Proxy({} as Database.Database, {
  get(_target, prop) {
    const database = getDatabase();
    if (!database) throw new Error('Database not available');
    return (database as any)[prop];
  }
});

export default dbProxy;

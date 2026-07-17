import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Only initialize database if not in build process
let db: Database.Database | null = null;

function getDatabase() {
  if (!db && (process.env.NODE_ENV !== 'test' || process.env.DATABASE_PATH) && typeof window === 'undefined') {
    // Tests point DATABASE_PATH at an isolated temp file or ':memory:'.
    const dbPath = process.env.DATABASE_PATH || './plebiscite.db';

    if (dbPath !== ':memory:') {
      const dbDir = path.dirname(dbPath);

      // Ensure directory exists
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
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
      plebiscite_id INTEGER,
      code TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plebiscite_id) REFERENCES plebiscites (id) ON DELETE CASCADE
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
    ALTER TABLE admin_login_attempts ADD COLUMN email TEXT;
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_admin_attempts_email ON admin_login_attempts(email);
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
  `,
  `
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'observer')) NOT NULL DEFAULT 'observer',
      active BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME NULL
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
    CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);
  `,
  `
    ALTER TABLE sessions ADD COLUMN admin_user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL;
  `,
  `
    ALTER TABLE sessions ADD COLUMN admin_role TEXT CHECK(admin_role IN ('admin', 'observer'));
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_sessions_admin_user ON sessions(admin_user_id);
  `,
  `
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id INTEGER,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_admin_audit_user ON admin_audit_log(admin_user_id);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at);
  `,
  `
    ALTER TABLE verification_codes ADD COLUMN plebiscite_id INTEGER REFERENCES plebiscites(id) ON DELETE CASCADE;
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_verification_codes_plebiscite ON verification_codes(plebiscite_id);
  `,
  `
    CREATE TABLE IF NOT EXISTS voter_verification_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      plebiscite_id INTEGER NOT NULL,
      success BOOLEAN DEFAULT FALSE,
      attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      locked_until DATETIME NULL,
      FOREIGN KEY (plebiscite_id) REFERENCES plebiscites(id) ON DELETE CASCADE
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_voter_attempts_email_plebiscite ON voter_verification_attempts(email, plebiscite_id);
    CREATE INDEX IF NOT EXISTS idx_voter_attempts_time ON voter_verification_attempts(attempted_at);
  `,
  `
    ALTER TABLE plebiscites ADD COLUMN privacy_mode TEXT CHECK(privacy_mode IN ('legacy', 'encrypted')) NOT NULL DEFAULT 'legacy';
  `,
  `
    ALTER TABLE plebiscites ADD COLUMN privacy_threshold INTEGER NOT NULL DEFAULT 5;
  `,
  `
    ALTER TABLE plebiscites ADD COLUMN manifest_hash TEXT;
  `,
  `
    ALTER TABLE plebiscites ADD COLUMN envelope_plaintext_bytes INTEGER;
  `,
  `
    ALTER TABLE plebiscites ADD COLUMN close_state TEXT CHECK(close_state IN ('none', 'closing', 'failed')) NOT NULL DEFAULT 'none';
  `,
  `
    ALTER TABLE plebiscites ADD COLUMN recovery_confirmed_at DATETIME;
  `,
  `
    ALTER TABLE questions ADD COLUMN public_id TEXT;
  `,
  `
    UPDATE questions
    SET public_id = lower(hex(randomblob(16)))
    WHERE public_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_public_id ON questions(public_id);
  `,
  `
    CREATE TABLE IF NOT EXISTS encrypted_election_keys (
      plebiscite_id INTEGER PRIMARY KEY,
      public_key_jwk TEXT NOT NULL,
      encrypted_private_key TEXT NOT NULL,
      key_iv TEXT NOT NULL,
      protocol TEXT NOT NULL,
      manifest_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plebiscite_id) REFERENCES plebiscites(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS encrypted_ballots (
      submission_id TEXT PRIMARY KEY,
      plebiscite_id INTEGER NOT NULL,
      voter_roll_id INTEGER NOT NULL,
      ciphertext_package TEXT NOT NULL,
      commitment TEXT NOT NULL,
      accepted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(plebiscite_id, voter_roll_id),
      UNIQUE(plebiscite_id, commitment),
      FOREIGN KEY (plebiscite_id) REFERENCES plebiscites(id) ON DELETE CASCADE,
      FOREIGN KEY (voter_roll_id) REFERENCES voter_roll(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_encrypted_ballots_plebiscite ON encrypted_ballots(plebiscite_id);

    CREATE TABLE IF NOT EXISTS encrypted_close_artifacts (
      plebiscite_id INTEGER PRIMARY KEY,
      input_count INTEGER NOT NULL,
      input_hash TEXT NOT NULL,
      output_hash TEXT,
      frozen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (plebiscite_id) REFERENCES plebiscites(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS published_ballots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plebiscite_id INTEGER NOT NULL,
      receipt_code TEXT NOT NULL,
      ballot_data TEXT NOT NULL,
      display_order INTEGER NOT NULL,
      UNIQUE(plebiscite_id, receipt_code),
      UNIQUE(plebiscite_id, display_order),
      FOREIGN KEY (plebiscite_id) REFERENCES plebiscites(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_published_ballots_plebiscite ON published_ballots(plebiscite_id);
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
  runAdministrativeRoleMigrations(database);
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
      migrateVoterRollUniqueness(database);
    });

    migratePrivacy();
  } finally {
    if (previousForeignKeys) {
      database.pragma('foreign_keys = ON');
    }
  }
}

function runAdministrativeRoleMigrations(database: Database.Database): void {
  const migrateRoles = database.transaction(() => {
    if (!hasColumn(database, 'admin_users', 'authority_role')) {
      database.exec(`
        ALTER TABLE admin_users ADD COLUMN authority_role TEXT
          CHECK(authority_role IN ('owner', 'returning_officer', 'admin', 'observer'));
      `);
    }

    database.exec(`
      UPDATE admin_users
      SET authority_role = CASE role WHEN 'admin' THEN 'admin' ELSE 'observer' END
      WHERE authority_role IS NULL;

      CREATE TABLE IF NOT EXISTS admin_invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        name TEXT,
        role TEXT CHECK(role IN ('returning_officer', 'admin', 'observer')) NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        invited_by_admin_user_id INTEGER NOT NULL,
        accepted_by_admin_user_id INTEGER,
        accepted_at DATETIME,
        revoked_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invited_by_admin_user_id) REFERENCES admin_users(id) ON DELETE RESTRICT,
        FOREIGN KEY (accepted_by_admin_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_admin_invitations_email ON admin_invitations(email);
      CREATE INDEX IF NOT EXISTS idx_admin_invitations_token ON admin_invitations(token_hash);
      CREATE INDEX IF NOT EXISTS idx_admin_invitations_expires ON admin_invitations(expires_at);

      CREATE TABLE IF NOT EXISTS election_team_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plebiscite_id INTEGER NOT NULL,
        admin_user_id INTEGER NOT NULL,
        role TEXT CHECK(role IN ('returning_officer', 'admin', 'observer')) NOT NULL,
        assigned_by_admin_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(plebiscite_id, admin_user_id),
        FOREIGN KEY (plebiscite_id) REFERENCES plebiscites(id) ON DELETE CASCADE,
        FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by_admin_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_election_team_user ON election_team_members(admin_user_id);
      CREATE INDEX IF NOT EXISTS idx_election_team_election ON election_team_members(plebiscite_id);
    `);

    if (!hasColumn(database, 'plebiscites', 'created_by_admin_user_id')) {
      database.exec('ALTER TABLE plebiscites ADD COLUMN created_by_admin_user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL');
    }
    if (!hasColumn(database, 'admin_invitations', 'plebiscite_id')) {
      database.exec('ALTER TABLE admin_invitations ADD COLUMN plebiscite_id INTEGER REFERENCES plebiscites(id) ON DELETE CASCADE');
      database.exec('CREATE INDEX IF NOT EXISTS idx_admin_invitations_election ON admin_invitations(plebiscite_id)');
    }

    const ownerCount = database.prepare("SELECT COUNT(*) AS count FROM admin_users WHERE authority_role = 'owner' AND active = 1")
      .get() as { count: number };
    if (ownerCount.count === 0) {
      database.prepare(`
        UPDATE admin_users
        SET role = 'admin', authority_role = 'owner', active = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = (
          SELECT id FROM admin_users
          ORDER BY active DESC, CASE role WHEN 'admin' THEN 0 ELSE 1 END, id ASC
          LIMIT 1
        )
      `).run();
    }

    // v0.3 roles were organisation-wide. Seed every existing election with the
    // same access before enforcing election scopes, making the migration lossless.
    database.exec(`
      INSERT OR IGNORE INTO election_team_members
        (plebiscite_id, admin_user_id, role, assigned_by_admin_user_id)
      SELECT p.id, u.id,
        CASE u.authority_role
          WHEN 'returning_officer' THEN 'returning_officer'
          WHEN 'admin' THEN 'admin'
          ELSE 'observer'
        END,
        (SELECT id FROM admin_users WHERE authority_role = 'owner' ORDER BY id LIMIT 1)
      FROM plebiscites p
      CROSS JOIN admin_users u
      WHERE u.active = 1 AND u.authority_role IN ('returning_officer', 'admin', 'observer');
    `);
  });

  migrateRoles();
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
      public_id TEXT,
      FOREIGN KEY (plebiscite_id) REFERENCES plebiscites (id) ON DELETE CASCADE
    );

    INSERT INTO questions_privacy_migration (id, plebiscite_id, title, description, type, options, display_order, preferential_type, public_id)
    SELECT id, plebiscite_id, title, description, type, options, display_order,
           COALESCE(preferential_type, 'compulsory'), public_id
    FROM questions;

    DROP TABLE questions;
    ALTER TABLE questions_privacy_migration RENAME TO questions;
    CREATE INDEX IF NOT EXISTS idx_questions_plebiscite ON questions(plebiscite_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_public_id ON questions(public_id);
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

function migrateVoterRollUniqueness(database: Database.Database): void {
  const sql = tableSql(database, 'voter_roll');
  if (!sql || sql.includes('UNIQUE(email, plebiscite_id)')) return;

  // Rebuild voter_roll so uniqueness is per election instead of global.
  // IDs are preserved because participation.voter_roll_id references them.
  // Legacy rows with NULL plebiscite_id are carried over unchanged; the old
  // global UNIQUE(email) guarantees the copy cannot conflict.
  database.exec(`
    CREATE TABLE voter_roll_multi_election_migration (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      plebiscite_id INTEGER REFERENCES plebiscites(id) ON DELETE CASCADE,
      UNIQUE(email, plebiscite_id)
    );

    INSERT INTO voter_roll_multi_election_migration (id, email, added_at, plebiscite_id)
    SELECT id, email, added_at, plebiscite_id
    FROM voter_roll;

    DROP TABLE voter_roll;
    ALTER TABLE voter_roll_multi_election_migration RENAME TO voter_roll;
    CREATE INDEX IF NOT EXISTS idx_voter_roll_email ON voter_roll(email);
    CREATE INDEX IF NOT EXISTS idx_voter_roll_plebiscite ON voter_roll(plebiscite_id);
  `);
}

function shuffleVotesForPlebiscite(database: Database.Database, plebisciteId: number): void {
  const rows = database.prepare(`
    SELECT v.question_id, v.vote_data, v.receipt_code
    FROM votes v
    JOIN questions q ON q.id = v.question_id
    WHERE q.plebiscite_id = ?
    ORDER BY v.id
  `).all(plebisciteId) as Array<{ question_id: number; vote_data: string; receipt_code: string }>;

  if (rows.length === 0) return;

  // Fisher-Yates with cryptographic randomness.
  for (let i = rows.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

  database.prepare(`
    DELETE FROM votes
    WHERE question_id IN (SELECT id FROM questions WHERE plebiscite_id = ?)
  `).run(plebisciteId);

  const insertVote = database.prepare(
    'INSERT INTO votes (question_id, vote_data, receipt_code) VALUES (?, ?, ?)'
  );
  for (const row of rows) {
    insertVote.run(row.question_id, row.vote_data, row.receipt_code);
  }
}

// Close-time privacy hardening (VK-007). Anonymous ballot rows are rebuilt in
// cryptographically shuffled order with fresh row IDs so the post-close
// database no longer preserves ballot insertion order, and voter sessions and
// verification codes for the plebiscite are purged. Everything runs in
// one transaction with the status transition: if any step fails, the
// plebiscite stays open and no data changes. The status-guarded UPDATE makes
// the hardening run exactly once, on the open -> closed transition.
export function closePlebisciteWithPrivacyHardening(plebisciteId: number): void {
  const database = getDatabase();
  if (!database) throw new Error('Database not available');

  const close = database.transaction((id: number) => {
    const updated = database.prepare(
      `UPDATE plebiscites SET status = 'closed' WHERE id = ? AND status = 'open'`
    ).run(id);
    if (updated.changes === 0) {
      throw new Error('Only open plebiscites can be closed');
    }

    shuffleVotesForPlebiscite(database, id);

    database.prepare('DELETE FROM verification_codes WHERE plebiscite_id = ?').run(id);
    database.prepare('DELETE FROM voter_verification_attempts WHERE plebiscite_id = ?').run(id);
    database.prepare('DELETE FROM sessions WHERE plebiscite_id = ?').run(id);
  });

  close(plebisciteId);
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

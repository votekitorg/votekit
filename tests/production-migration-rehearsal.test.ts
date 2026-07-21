import { afterAll, describe, expect, it } from 'vitest';

const rehearsalDatabase = process.env.MIGRATION_REHEARSAL_DB;

describe.skipIf(!rehearsalDatabase)('production database migration rehearsal', () => {
  let db: Awaited<typeof import('@/lib/db')>['default'];

  afterAll(() => {
    db?.close();
  });

  it('migrates a private production copy without integrity or schema failures', async () => {
    process.env.DATABASE_PATH = rehearsalDatabase;
    db = (await import('@/lib/db')).default;

    expect(db.pragma('quick_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toHaveLength(0);

    const electionColumns = db.pragma('table_info(plebiscites)') as Array<{ name: string }>;
    const sessionColumns = db.pragma('table_info(sessions)') as Array<{ name: string }>;
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;

    expect(electionColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'access_mode', 'sms_enabled', 'opening_mode', 'actual_opened_at', 'scheduled_open_attempted_at', 'scheduled_open_error'
    ]));
    expect(sessionColumns.map((column) => column.name)).toEqual(expect.arrayContaining(['voter_roll_id', 'anonymous_code_id', 'credential_type']));
    expect(tables.map((table) => table.name)).toEqual(expect.arrayContaining([
      'anonymous_access_codes', 'voter_link_tokens', 'irv_tie_resolutions',
      'email_jobs', 'email_suppressions', 'email_webhook_events'
    ]));
  });
});

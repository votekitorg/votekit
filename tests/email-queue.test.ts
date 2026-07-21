import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildVoterLinkEmail } from '@/lib/email';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-email-queue-'));
const databasePath = path.join(tmpDir, 'test.db');
process.env.DATABASE_PATH = databasePath;
process.env.EMAIL_QUEUE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
let db: any;
let electionId: number;

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  electionId = Number(db.prepare(`INSERT INTO plebiscites
    (slug, title, description, open_date, close_date, status, access_mode)
    VALUES ('queued-election', 'Queued election', 'Test', ?, ?, 'open', 'voter_roll')`)
    .run(new Date().toISOString(), new Date(Date.now() + 86_400_000).toISOString()).lastInsertRowid);
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('durable email queue', () => {
  it('encrypts private voter links at rest and records suppressed recipients', async () => {
    const { queueBulkEmails } = await import('@/lib/email-queue');
    db.prepare(`INSERT INTO email_suppressions (email, reason) VALUES ('blocked@example.com', 'bounce')`).run();
    const inputs = ['eligible@example.com', 'blocked@example.com'].map((email, index) => ({
      plebisciteId: electionId,
      kind: 'voter_link' as const,
      recipient: email,
      payload: buildVoterLinkEmail({
        email, electionTitle: 'Queued election', electionDescription: 'Test',
        ballotUrl: `https://votekit.example/vote/queued-election#voter=private-token-${index}`
      })
    }));
    const result = queueBulkEmails(inputs);
    expect(result.queued).toBe(1);
    expect(result.suppressed).toBe(1);
    const rows = db.prepare('SELECT status, encrypted_payload FROM email_jobs ORDER BY recipient').all();
    expect(rows.map((row: any) => row.status)).toEqual(['suppressed', 'queued']);
    expect(rows.every((row: any) => !row.encrypted_payload.includes('private-token'))).toBe(true);
  });

  it('delivers in Resend batches of no more than 100 and stores provider IDs', async () => {
    const { queueBulkEmails } = await import('@/lib/email-queue');
    const inputs = Array.from({ length: 205 }, (_, index) => {
      const email = `voter-${index}@example.com`;
      return {
        plebisciteId: electionId,
        kind: 'voter_link' as const,
        recipient: email,
        payload: buildVoterLinkEmail({
          email, electionTitle: 'Queued election', electionDescription: 'Test',
          ballotUrl: `https://votekit.example/vote/queued-election#voter=token-${index}`
        })
      };
    });
    queueBulkEmails(inputs);

    const batchSizes: number[] = [];
    let messageNumber = 0;
    const server = http.createServer((request, response) => {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        const messages = JSON.parse(body);
        batchSizes.push(messages.length);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ data: messages.map(() => ({ id: `provider-${messageNumber++}` })) }));
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Mock server did not start');

    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, ['scripts/email-worker.mjs'], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_PATH: databasePath,
            RESEND_API_KEY: 'test-key',
            RESEND_BASE_URL: `http://127.0.0.1:${address.port}`,
            EMAIL_WORKER_ONCE: 'true'
          },
          stdio: 'ignore'
        });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Worker exited ${code}`)));
      });
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }

    expect(batchSizes).toEqual([100, 100, 6]);
    const sent = db.prepare(`SELECT COUNT(*) AS count FROM email_jobs WHERE status = 'sent'`).get().count;
    expect(sent).toBe(206);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM email_jobs WHERE status = 'sent' AND encrypted_payload = ''`).get().count).toBe(206);
  });
});

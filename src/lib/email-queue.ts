import crypto from 'node:crypto';
import db from './db';
import type { EmailPayload } from './email';

type BulkEmailKind = 'voter_link' | 'voter_reminder';

export interface QueueEmailInput {
  plebisciteId: number;
  kind: BulkEmailKind;
  recipient: string;
  payload: EmailPayload;
}

function encryptionKey(): Buffer {
  const configured = process.env.EMAIL_QUEUE_ENCRYPTION_KEY || '';
  const key = /^[a-f\d]{64}$/iu.test(configured)
    ? Buffer.from(configured, 'hex')
    : Buffer.from(configured, 'base64');
  if (key.length !== 32) throw new Error('EMAIL_QUEUE_ENCRYPTION_KEY must encode exactly 32 bytes');
  return key;
}

export function encryptEmailPayload(payload: EmailPayload): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function queueBulkEmails(inputs: QueueEmailInput[]): { campaignId: string; queued: number; suppressed: number } {
  const campaignId = crypto.randomUUID();
  let queued = 0;
  let suppressed = 0;
  const suppression = db.prepare('SELECT reason FROM email_suppressions WHERE email = ?');
  const insert = db.prepare(`INSERT INTO email_jobs
    (id, campaign_id, plebiscite_id, kind, recipient, encrypted_payload, priority, status, last_error)
    VALUES (?, ?, ?, ?, ?, ?, 10, ?, ?)`);

  db.transaction(() => {
    for (const input of inputs) {
      const blocked = suppression.get(input.recipient.toLowerCase()) as { reason: string } | undefined;
      const status = blocked ? 'suppressed' : 'queued';
      insert.run(
        crypto.randomUUID(), campaignId, input.plebisciteId, input.kind,
        input.recipient.toLowerCase(), encryptEmailPayload(input.payload), status,
        blocked ? `Suppressed after ${blocked.reason}` : null
      );
      if (blocked) suppressed += 1;
      else queued += 1;
    }
  })();

  return { campaignId, queued, suppressed };
}

export function getElectionEmailStats(plebisciteId: number) {
  const rows = db.prepare(`SELECT status, COUNT(*) AS count FROM email_jobs
    WHERE plebiscite_id = ? GROUP BY status`).all(plebisciteId) as Array<{ status: string; count: number }>;
  const stats = { queued: 0, processing: 0, sent: 0, failed: 0, suppressed: 0 };
  for (const row of rows) {
    if (row.status in stats) stats[row.status as keyof typeof stats] = row.count;
  }
  return stats;
}

export function cancelPendingElectionEmails(plebisciteId: number): number {
  const processing = db.prepare(`SELECT COUNT(*) AS count FROM email_jobs
    WHERE plebiscite_id = ? AND status = 'processing'`).get(plebisciteId) as { count: number };
  if (processing.count > 0) throw new Error('An earlier mailing batch is currently being delivered. Try again in a moment.');
  return db.prepare(`UPDATE email_jobs SET status = 'failed', encrypted_payload = '',
    last_error = 'Replaced by a newer mailing request'
    WHERE plebiscite_id = ? AND status = 'queued'`).run(plebisciteId).changes;
}

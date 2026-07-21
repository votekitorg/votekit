import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { Resend } from 'resend';

const databasePath = process.env.DATABASE_PATH || '/var/lib/votekit/plebiscite.db';
const database = new Database(databasePath);
database.pragma('foreign_keys = ON');
database.pragma('journal_mode = WAL');
database.pragma('busy_timeout = 5000');
const resend = new Resend(process.env.RESEND_API_KEY || '');
let stopping = false;

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function encryptionKey() {
  const configured = process.env.EMAIL_QUEUE_ENCRYPTION_KEY || '';
  const key = /^[a-f\d]{64}$/iu.test(configured)
    ? Buffer.from(configured, 'hex')
    : Buffer.from(configured, 'base64');
  if (key.length !== 32) throw new Error('EMAIL_QUEUE_ENCRYPTION_KEY must encode exactly 32 bytes');
  return key;
}

function decryptPayload(value) {
  const packed = Buffer.from(value, 'base64');
  if (packed.length < 29) throw new Error('Invalid encrypted email payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8'));
}

const recoverExpiredLeases = database.prepare(`UPDATE email_jobs
  SET status = 'queued', locked_at = NULL, next_attempt_at = CURRENT_TIMESTAMP
  WHERE status = 'processing' AND locked_at < datetime('now', '-10 minutes')`);
const firstReady = database.prepare(`SELECT id, delivery_batch_id FROM email_jobs
  WHERE status = 'queued' AND next_attempt_at <= CURRENT_TIMESTAMP
  ORDER BY priority DESC, created_at, id LIMIT 1`);
const unbatchedReady = database.prepare(`SELECT id FROM email_jobs
  WHERE status = 'queued' AND delivery_batch_id IS NULL AND next_attempt_at <= CURRENT_TIMESTAMP
  ORDER BY priority DESC, created_at, id LIMIT 100`);
const assignBatch = database.prepare(`UPDATE email_jobs SET delivery_batch_id = ? WHERE id = ? AND status = 'queued'`);
const loadBatch = database.prepare(`SELECT id, encrypted_payload, attempts, max_attempts FROM email_jobs
  WHERE status = 'queued' AND delivery_batch_id = ? AND next_attempt_at <= CURRENT_TIMESTAMP
  ORDER BY created_at, id LIMIT 100`);
const claimJob = database.prepare(`UPDATE email_jobs SET status = 'processing', locked_at = CURRENT_TIMESTAMP
  WHERE id = ? AND status = 'queued'`);

function claimNextBatch() {
  return database.transaction(() => {
    recoverExpiredLeases.run();
    const first = firstReady.get();
    if (!first) return null;
    let batchId = first.delivery_batch_id;
    if (!batchId) {
      batchId = crypto.randomUUID();
      for (const row of unbatchedReady.all()) assignBatch.run(batchId, row.id);
    }
    const rows = loadBatch.all(batchId);
    const claimed = rows.filter(row => claimJob.run(row.id).changes === 1);
    return claimed.length ? { batchId, rows: claimed } : null;
  })();
}

const markSent = database.prepare(`UPDATE email_jobs
  SET status = 'sent', attempts = attempts + 1, provider_message_id = ?, sent_at = CURRENT_TIMESTAMP,
      locked_at = NULL, last_error = NULL, encrypted_payload = '' WHERE id = ?`);
const markRetry = database.prepare(`UPDATE email_jobs SET
  status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'queued' END,
  attempts = attempts + 1,
  next_attempt_at = datetime('now', '+' || MIN(3600, 30 * (1 << MIN(attempts, 6))) || ' seconds'),
  locked_at = NULL, last_error = ? WHERE id = ?`);

async function deliver(batch) {
  let payloads;
  try {
    payloads = batch.rows.map(row => decryptPayload(row.encrypted_payload));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Payload decryption failed';
    database.transaction(() => batch.rows.forEach(row => markRetry.run(message, row.id)))();
    return;
  }

  try {
    const response = await resend.batch.send(payloads, {
      idempotencyKey: `votekit-batch-${batch.batchId}`,
      batchValidation: 'strict'
    });
    if (response.error || !response.data || response.data.data.length !== batch.rows.length) {
      throw new Error(response.error?.message || 'Resend returned an incomplete batch response');
    }
    database.transaction(() => {
      batch.rows.forEach((row, index) => markSent.run(response.data.data[index].id, row.id));
    })();
    console.log(`Delivered email batch: ${batch.rows.length} message(s)`);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown Resend error';
    database.transaction(() => batch.rows.forEach(row => markRetry.run(message, row.id)))();
    console.error(`Email batch failed and was scheduled for retry: ${batch.rows.length} message(s)`);
  }
}

async function main() {
  encryptionKey();
  const runOnce = process.env.EMAIL_WORKER_ONCE === 'true';
  console.log('VoteKit email worker started');
  while (!stopping) {
    const batch = claimNextBatch();
    if (!batch) {
      if (runOnce) break;
      await sleep(2000);
      continue;
    }
    await deliver(batch);
    // Reserve most of the account's request allowance for interactive OTP emails.
    if (!runOnce) await sleep(750);
  }
  database.close();
}

process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

main().catch(error => {
  console.error('VoteKit email worker stopped:', error instanceof Error ? error.message : 'Unknown error');
  database.close();
  process.exitCode = 1;
});

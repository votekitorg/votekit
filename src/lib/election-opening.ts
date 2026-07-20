import db from '@/lib/db';
import { recordAdminAuditLog } from '@/lib/auth';
import { parseElectionCloseDate, votingClosedError } from '@/lib/election-window';
import { buildAndHashEncryptedManifest, encryptedBallotsEnabled } from '@/lib/encrypted-election-server';

export interface ElectionOpeningResult {
  opened: boolean;
  error?: string;
}

export async function openElectionNow(
  plebisciteId: number,
  options: { adminUserId?: number | null; source: 'manual' | 'scheduled' }
): Promise<ElectionOpeningResult> {
  const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE id = ?').get(plebisciteId) as any;
  if (!plebiscite || plebiscite.status !== 'draft' || plebiscite.archived_at) {
    return { opened: false, error: 'Only an active draft election can be opened' };
  }

  const voterCount = (db.prepare('SELECT COUNT(*) AS count FROM voter_roll WHERE plebiscite_id = ?').get(plebisciteId) as { count: number }).count;
  const accessCodeCount = (db.prepare('SELECT COUNT(*) AS count FROM anonymous_access_codes WHERE plebiscite_id = ?').get(plebisciteId) as { count: number }).count;
  const questionCount = (db.prepare('SELECT COUNT(*) AS count FROM questions WHERE plebiscite_id = ?').get(plebisciteId) as { count: number }).count;
  const credentialCount = plebiscite.access_mode === 'anonymous_codes' ? accessCodeCount : voterCount;
  if (credentialCount === 0 || questionCount === 0) {
    return {
      opened: false,
      error: plebiscite.access_mode === 'anonymous_codes'
        ? 'Generate at least one anonymous voting code before opening this election'
        : 'Add at least one voter before opening this election'
    };
  }
  const closeError = votingClosedError(plebiscite);
  if (closeError) return { opened: false, error: 'The closing date must be in the future before this election can open' };

  if (plebiscite.privacy_mode === 'encrypted') {
    if (!encryptedBallotsEnabled) return { opened: false, error: 'Encrypted ballots are disabled on this installation' };
    const key = db.prepare('SELECT manifest_hash FROM encrypted_election_keys WHERE plebiscite_id = ?').get(plebisciteId) as any;
    const currentManifest = await buildAndHashEncryptedManifest(plebiscite);
    if (!key || !plebiscite.manifest_hash || !plebiscite.recovery_confirmed_at) {
      return { opened: false, error: 'Prepare and save the encrypted ballot recovery kit before opening' };
    }
    if (key.manifest_hash !== currentManifest.manifestHash || plebiscite.manifest_hash !== currentManifest.manifestHash) {
      return { opened: false, error: 'Election details changed after key preparation. Prepare a new recovery kit.' };
    }
  }

  const opened = db.prepare(`
    UPDATE plebiscites
    SET status = 'open', actual_opened_at = CURRENT_TIMESTAMP,
        scheduled_open_error = NULL
    WHERE id = ? AND status = 'draft' AND archived_at IS NULL
  `).run(plebisciteId);
  if (opened.changes === 0) return { opened: false, error: 'Election status changed before it could be opened' };
  recordAdminAuditLog({
    adminUserId: options.adminUserId ?? null,
    action: options.source === 'scheduled' ? 'plebiscite.open.scheduled' : 'plebiscite.open',
    targetType: 'plebiscite',
    targetId: plebisciteId,
    details: { slug: plebiscite.slug, source: options.source }
  });
  return { opened: true };
}

export async function reconcileScheduledElection(input: { id?: number; slug?: string }, now: Date = new Date()): Promise<ElectionOpeningResult> {
  const plebiscite = input.id
    ? db.prepare('SELECT * FROM plebiscites WHERE id = ?').get(input.id) as any
    : db.prepare('SELECT * FROM plebiscites WHERE slug = ?').get(input.slug) as any;
  if (!plebiscite || plebiscite.status !== 'draft' || plebiscite.opening_mode !== 'scheduled' ||
    plebiscite.archived_at || plebiscite.scheduled_open_attempted_at ||
    parseElectionCloseDate(plebiscite.open_date) > now) {
    return { opened: false };
  }

  // Claim the due activation before doing readiness work. This makes the
  // transition at-most-once when several voters arrive at the same moment.
  const claimed = db.prepare(`
    UPDATE plebiscites
    SET scheduled_open_attempted_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'draft' AND opening_mode = 'scheduled'
      AND archived_at IS NULL AND scheduled_open_attempted_at IS NULL
  `).run(plebiscite.id);
  if (claimed.changes === 0) return { opened: false };

  const result = await openElectionNow(plebiscite.id, { source: 'scheduled' });
  db.prepare(`
    UPDATE plebiscites
    SET scheduled_open_error = ?
    WHERE id = ?
  `).run(result.opened ? null : result.error || 'Election was not ready to open', plebiscite.id);
  return result;
}

export async function reconcileScheduledElections(now: Date = new Date()): Promise<void> {
  const due = db.prepare(`
    SELECT id FROM plebiscites
    WHERE status = 'draft' AND opening_mode = 'scheduled'
      AND archived_at IS NULL AND scheduled_open_attempted_at IS NULL
  `).all() as Array<{ id: number }>;
  for (const election of due) {
    if (parseElectionCloseDate((db.prepare('SELECT open_date FROM plebiscites WHERE id = ?').get(election.id) as { open_date: string }).open_date) <= now) {
      await reconcileScheduledElection({ id: election.id }, now);
    }
  }
}

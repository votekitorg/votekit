import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAdminSessionFromRequest, recordAdminAuditLog, requireAdminRole, validateCSRFRequest } from '@/lib/auth';
import {
  canonicalStringify,
  DEFAULT_ENVELOPE_PLAINTEXT_BYTES,
  DEFAULT_PRIVACY_THRESHOLD,
  ENCRYPTED_BALLOT_PROTOCOL,
  PublishedEncryptedBallot,
  sha256Base64Url,
  validatePublishedBallot
} from '@/lib/encrypted-ballots';
import { buildAndHashEncryptedManifest, buildEncryptedManifest, encryptedBallotsEnabled } from '@/lib/encrypted-election-server';

const BASE64URL = /^[A-Za-z0-9_-]+$/u;

function adminFor(request: NextRequest) {
  const session = getAdminSessionFromRequest(request);
  return session && requireAdminRole(session) ? session : null;
}

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const admin = adminFor(request);
  if (!admin) return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
  if (!encryptedBallotsEnabled) return NextResponse.json({ error: 'Encrypted ballots are not enabled on this installation' }, { status: 404 });

  try {
    const body = await request.json();
    const id = Number(body?.id);
    const action = body?.action;
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Election ID is required' }, { status: 400 });
    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE id = ?').get(id) as any;
    if (!plebiscite) return NextResponse.json({ error: 'Election not found' }, { status: 404 });

    if (action === 'prepare') {
      if (plebiscite.status !== 'draft') return NextResponse.json({ error: 'Only draft elections can prepare encryption' }, { status: 400 });
      const { publicKeyJwk, encryptedPrivateKey, keyIv, manifestHash } = body;
      const generated = await buildAndHashEncryptedManifest({
        ...plebiscite,
        envelope_plaintext_bytes: DEFAULT_ENVELOPE_PLAINTEXT_BYTES
      });
      if (manifestHash !== generated.manifestHash) return NextResponse.json({ error: 'Election manifest changed during key preparation' }, { status: 409 });
      if (
        !publicKeyJwk || publicKeyJwk.kty !== 'RSA' || publicKeyJwk.e !== 'AQAB' ||
        typeof publicKeyJwk.n !== 'string' || publicKeyJwk.n.length !== 512 ||
        ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some(field => publicKeyJwk[field] !== undefined) ||
        !Array.isArray(publicKeyJwk.key_ops) || publicKeyJwk.key_ops.length !== 1 || publicKeyJwk.key_ops[0] !== 'encrypt' ||
        typeof encryptedPrivateKey !== 'string' || encryptedPrivateKey.length < 1_500 || encryptedPrivateKey.length > 4_096 || !BASE64URL.test(encryptedPrivateKey) ||
        typeof keyIv !== 'string' || keyIv.length !== 16 || !BASE64URL.test(keyIv)
      ) return NextResponse.json({ error: 'Invalid encrypted key package' }, { status: 400 });

      const prepare = db.transaction(() => {
        db.prepare(`
          INSERT INTO encrypted_election_keys
            (plebiscite_id, public_key_jwk, encrypted_private_key, key_iv, protocol, manifest_hash)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(plebiscite_id) DO UPDATE SET
            public_key_jwk = excluded.public_key_jwk,
            encrypted_private_key = excluded.encrypted_private_key,
            key_iv = excluded.key_iv,
            protocol = excluded.protocol,
            manifest_hash = excluded.manifest_hash,
            created_at = CURRENT_TIMESTAMP
        `).run(id, JSON.stringify(publicKeyJwk), encryptedPrivateKey, keyIv, ENCRYPTED_BALLOT_PROTOCOL, manifestHash);
        db.prepare(`
          UPDATE plebiscites SET privacy_mode = 'encrypted', privacy_threshold = ?,
            manifest_hash = ?, envelope_plaintext_bytes = ?, close_state = 'none', recovery_confirmed_at = NULL
          WHERE id = ? AND status = 'draft'
        `).run(DEFAULT_PRIVACY_THRESHOLD, manifestHash, DEFAULT_ENVELOPE_PLAINTEXT_BYTES, id);
      });
      prepare.immediate();
      recordAdminAuditLog({
        adminUserId: admin.adminUserId,
        action: 'plebiscite.encryption.prepare',
        targetType: 'plebiscite', targetId: id,
        details: { protocol: ENCRYPTED_BALLOT_PROTOCOL, manifestHash }
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'confirm-recovery') {
      if (plebiscite.status !== 'draft' || plebiscite.privacy_mode !== 'encrypted') {
        return NextResponse.json({ error: 'Recovery can only be confirmed for a draft encrypted election' }, { status: 400 });
      }
      const key = db.prepare('SELECT 1 FROM encrypted_election_keys WHERE plebiscite_id = ?').get(id);
      if (!key) return NextResponse.json({ error: 'Prepare the encrypted ballot box first' }, { status: 409 });
      db.prepare('UPDATE plebiscites SET recovery_confirmed_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
      recordAdminAuditLog({
        adminUserId: admin.adminUserId,
        action: 'plebiscite.encryption.recovery-confirmed',
        targetType: 'plebiscite', targetId: id
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'start-close') {
      if (plebiscite.status !== 'open' || plebiscite.privacy_mode !== 'encrypted') {
        return NextResponse.json({ error: 'Only open encrypted elections can be closed here' }, { status: 400 });
      }
      const key = db.prepare('SELECT * FROM encrypted_election_keys WHERE plebiscite_id = ?').get(id) as any;
      if (!key) return NextResponse.json({ error: 'Election key package is missing' }, { status: 409 });
      const manifest = buildEncryptedManifest(plebiscite);
      // Acquire the SQLite write lock and stop intake before reading the set.
      // A concurrent vote therefore either commits before this snapshot or sees
      // close_state=closing and is rejected. There is no subset window.
      const beginFreeze = db.transaction(() => {
        const current = db.prepare('SELECT status, close_state FROM plebiscites WHERE id = ?').get(id) as any;
        if (!current || current.status !== 'open' || !['none', 'closing', 'failed'].includes(current.close_state)) {
          throw new Error('Election can no longer enter closing');
        }
        db.prepare(`UPDATE plebiscites SET close_state = 'closing' WHERE id = ?`).run(id);
        return db.prepare(`
          SELECT ciphertext_package, commitment FROM encrypted_ballots
          WHERE plebiscite_id = ? ORDER BY commitment
        `).all(id) as Array<{ ciphertext_package: string; commitment: string }>;
      });
      const rows = beginFreeze.immediate();
      const inputHash = await sha256Base64Url(canonicalStringify(rows.map(row => row.commitment)));

      const freeze = db.transaction(() => {
        const current = db.prepare('SELECT status, close_state FROM plebiscites WHERE id = ?').get(id) as any;
        if (!current || current.status !== 'open' || current.close_state !== 'closing') {
          throw new Error('Election can no longer enter closing');
        }
        const existing = db.prepare('SELECT input_count, input_hash FROM encrypted_close_artifacts WHERE plebiscite_id = ?').get(id) as any;
        if (existing && (existing.input_count !== rows.length || existing.input_hash !== inputHash)) {
          throw new Error('Frozen encrypted ballot set has changed');
        }
        db.prepare(`
          INSERT INTO encrypted_close_artifacts (plebiscite_id, input_count, input_hash)
          VALUES (?, ?, ?)
          ON CONFLICT(plebiscite_id) DO NOTHING
        `).run(id, rows.length, inputHash);
      });
      freeze.immediate();
      return NextResponse.json({
        success: true,
        manifest,
        manifestHash: plebiscite.manifest_hash,
        inputHash,
        encryptedPrivateKey: key.encrypted_private_key,
        keyIv: key.key_iv,
        packages: rows.map(row => JSON.parse(row.ciphertext_package))
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'complete-close') {
      if (plebiscite.status !== 'open' || plebiscite.privacy_mode !== 'encrypted' || plebiscite.close_state !== 'closing') {
        return NextResponse.json({ error: 'Election is not awaiting its shuffled ballot box' }, { status: 409 });
      }
      if (!Array.isArray(body.ballots) || body.ballots.length > 100_000 || typeof body.inputHash !== 'string') {
        return NextResponse.json({ error: 'Invalid shuffled ballot artifact' }, { status: 400 });
      }
      const manifest = buildEncryptedManifest(plebiscite);
      const ballots = body.ballots as PublishedEncryptedBallot[];
      if (!ballots.every(ballot => validatePublishedBallot(manifest, ballot))) {
        return NextResponse.json({ error: 'A shuffled ballot failed schema validation' }, { status: 400 });
      }
      if (new Set(ballots.map(ballot => ballot.receipt)).size !== ballots.length) {
        return NextResponse.json({ error: 'Duplicate receipt in shuffled ballot artifact' }, { status: 400 });
      }
      const outputHash = await sha256Base64Url(canonicalStringify(ballots));

      const complete = db.transaction(() => {
        const artifact = db.prepare(`
          SELECT input_count, input_hash FROM encrypted_close_artifacts WHERE plebiscite_id = ?
        `).get(id) as any;
        const current = db.prepare('SELECT status, close_state FROM plebiscites WHERE id = ?').get(id) as any;
        if (!artifact || artifact.input_hash !== body.inputHash || artifact.input_count !== ballots.length ||
          !current || current.status !== 'open' || current.close_state !== 'closing') {
          throw new Error('Shuffled artifact does not match the frozen ballot box');
        }
        db.prepare('DELETE FROM published_ballots WHERE plebiscite_id = ?').run(id);
        const insert = db.prepare(`
          INSERT INTO published_ballots (plebiscite_id, receipt_code, ballot_data, display_order)
          VALUES (?, ?, ?, ?)
        `);
        ballots.forEach((ballot, index) => insert.run(id, ballot.receipt, JSON.stringify(ballot.answers), index));
        db.prepare(`
          UPDATE encrypted_close_artifacts SET output_hash = ?, completed_at = CURRENT_TIMESTAMP
          WHERE plebiscite_id = ?
        `).run(outputHash, id);
        db.prepare('DELETE FROM encrypted_ballots WHERE plebiscite_id = ?').run(id);
        db.prepare('DELETE FROM verification_codes WHERE plebiscite_id = ?').run(id);
        db.prepare('DELETE FROM voter_verification_attempts WHERE plebiscite_id = ?').run(id);
        db.prepare('DELETE FROM sessions WHERE plebiscite_id = ?').run(id);
        db.prepare(`UPDATE plebiscites SET status = 'closed', close_state = 'none' WHERE id = ?`).run(id);
      });
      complete.immediate();
      recordAdminAuditLog({
        adminUserId: admin.adminUserId,
        action: 'plebiscite.encrypted-close',
        targetType: 'plebiscite', targetId: id,
        details: { ballotCount: ballots.length, inputHash: body.inputHash, outputHash }
      });
      return NextResponse.json({ success: true, status: 'closed', outputHash });
    }

    return NextResponse.json({ error: 'Unknown encrypted election action' }, { status: 400 });
  } catch (error) {
    console.error('Encrypted election operation failed:', error);
    return NextResponse.json({ error: 'Encrypted election operation failed safely; no ballots were published' }, { status: 500 });
  }
}

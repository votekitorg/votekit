import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import db from './db';
import { recordAdminAuditLog, type AdminSession } from './auth';

export class PasswordResetError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const invalid = () => new PasswordResetError('This reset link is invalid or has expired. Ask the Owner to send a new one.');
const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const fingerprint = (user: any) => digest(JSON.stringify([user.email, user.password_hash, user.authority_role || user.role, user.active]));

export function createPasswordReset(targetId: number, actor: AdminSession) {
  if (actor.role !== 'owner') throw new PasswordResetError('Owner role required', 403);
  if (!Number.isSafeInteger(targetId) || targetId < 1) throw new PasswordResetError('Account ID is required');
  return db.transaction(() => {
    const issuer = db.prepare("SELECT id FROM admin_users WHERE id = ? AND active = 1 AND authority_role = 'owner'").get(actor.adminUserId);
    if (!issuer) throw new PasswordResetError('Owner role required', 403);
    const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(targetId) as any;
    if (!user || !user.active || (user.authority_role || user.role) === 'owner') {
      throw new PasswordResetError('Choose an active Returning Officer, Admin or Observer account');
    }
    const now = Date.now();
    const recent = db.prepare('SELECT created_at FROM admin_password_resets WHERE admin_user_id = ? AND created_at > ? ORDER BY created_at DESC')
      .all(targetId, now - 3_600_000) as Array<{created_at: number}>;
    const actorCount = db.prepare('SELECT count(*) AS n FROM admin_password_resets WHERE requested_by = ? AND created_at > ?')
      .get(actor.adminUserId, now - 3_600_000) as {n: number};
    if (recent.length >= 5 || actorCount.n >= 20 || (recent[0] && recent[0].created_at > now - 60_000)) {
      throw new PasswordResetError('Too many reset requests. Wait before sending another.', 429);
    }
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('UPDATE admin_password_resets SET revoked_at = ? WHERE admin_user_id = ? AND used_at IS NULL AND revoked_at IS NULL').run(now, targetId);
    const result = db.prepare(`INSERT INTO admin_password_resets
      (admin_user_id, requested_by, token_hash, account_fingerprint, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(targetId, actor.adminUserId, digest(token), fingerprint(user), now, now + 30 * 60_000);
    recordAdminAuditLog({adminUserId: actor.adminUserId, action:'admin_password_reset.request', targetType:'admin_user', targetId, details:null});
    return { id: Number(result.lastInsertRowid), token, email: user.email as string, name: user.name as string | null };
  }).immediate();
}

export function revokePasswordReset(id: number) {
  db.prepare('UPDATE admin_password_resets SET revoked_at = ? WHERE id = ? AND used_at IS NULL').run(Date.now(), id);
}

function validReset(token: unknown) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalid();
  const reset = db.prepare(`SELECT r.*, u.email, u.name, u.password_hash, u.role, u.authority_role, u.active
    FROM admin_password_resets r JOIN admin_users u ON u.id = r.admin_user_id
    JOIN admin_users issuer ON issuer.id = r.requested_by
    WHERE r.token_hash = ? AND r.used_at IS NULL AND r.revoked_at IS NULL AND r.expires_at > ?
      AND u.active = 1 AND issuer.active = 1 AND issuer.authority_role = 'owner'`)
    .get(digest(token), Date.now()) as any;
  if (!reset || (reset.authority_role || reset.role) === 'owner' || fingerprint(reset) !== reset.account_fingerprint) throw invalid();
  return reset;
}

export function inspectPasswordReset(token: unknown) {
  const reset = validReset(token);
  return { email: reset.email as string, expiresAt: new Date(reset.expires_at).toISOString() };
}

export async function completePasswordReset(token: unknown, password: unknown, confirmation: unknown) {
  const first = validReset(token);
  if (typeof password !== 'string' || password.length < 12 || password.length > 128 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new PasswordResetError(typeof password === 'string' && password.length >= 12 ? 'Password is too long. Please choose a shorter password.' : 'Use at least 12 characters for your password.');
  }
  if (confirmation !== password) throw new PasswordResetError('The passwords do not match');
  const hash = await bcrypt.hash(password, 12);
  return db.transaction(() => {
    const current = validReset(token);
    if (current.id !== first.id) throw invalid();
    const now = Date.now();
    db.prepare('UPDATE admin_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, current.admin_user_id);
    db.prepare('UPDATE admin_password_resets SET used_at = ? WHERE id = ?').run(now, current.id);
    db.prepare('UPDATE admin_password_resets SET revoked_at = ? WHERE admin_user_id = ? AND id != ? AND revoked_at IS NULL AND used_at IS NULL')
      .run(now, current.admin_user_id, current.id);
    db.prepare('DELETE FROM sessions WHERE admin_user_id = ?').run(current.admin_user_id);
    recordAdminAuditLog({adminUserId: current.admin_user_id, action:'admin_password_reset.complete', targetType:'admin_user', targetId:current.admin_user_id, details:{requestedBy:current.requested_by}});
    return {id: current.admin_user_id as number, email: current.email as string, name: current.name as string | null};
  }).immediate();
}

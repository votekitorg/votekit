import { Resend } from 'resend';
import crypto from 'crypto';
import db from './db';

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || 'dummy');
  }
  return _resend;
}

export interface EmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

function senderOptions() {
  return {
    from: process.env.FROM_EMAIL || 'VoteKit <hello@votekit.org>',
    replyTo: process.env.REPLY_TO_EMAIL || 'owner@votekit.org'
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function sendVerificationEmail(
  email: string,
  code: string,
  plebisciteTitle: string
): Promise<EmailResult> {
  const safeTitle = escapeHtml(plebisciteTitle);
  const subjectTitle = plebisciteTitle.replace(/[\r\n]+/g, ' ').trim();
  
  try {
    const result = await getResend().emails.send({
      ...senderOptions(),
      to: email,
      subject: `Verification Code: ${subjectTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #00843D; margin: 0;">VoteKit Election Platform</h1>
          </div>
          
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
            <h2 style="color: #1B5E20; margin-top: 0;">Verification Required</h2>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">
              You have requested to participate in the election: <strong>${safeTitle}</strong>
            </p>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">
              Your verification code is:
            </p>
            <div style="text-align: center; margin: 25px 0;">
              <span style="background-color: #00843D; color: white; font-size: 24px; font-weight: bold; padding: 15px 25px; border-radius: 5px; letter-spacing: 3px; font-family: monospace;">
                ${code}
              </span>
            </div>
            <p style="color: #666; font-size: 14px; line-height: 1.4;">
              This code will expire in 10 minutes. If you did not request this code, please ignore this email.
            </p>
          </div>
          
          <div style="border-top: 1px solid #e0e0e0; padding-top: 20px; text-align: center;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              This is an automated message from VoteKit.
            </p>
          </div>
        </div>
      `,
      text: `
        VoteKit Election Platform
        
        Verification Required
        
        You have requested to participate in the election: ${plebisciteTitle}
        
        Your verification code is: ${code}
        
        This code will expire in 10 minutes. If you did not request this code, please ignore this email.
        
        This is an automated message from the VoteKit Election Platform.
      `
    });

    return {
      success: true,
      messageId: result.data?.id
    };
  } catch (error) {
    console.error('Failed to send verification email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function sendAdminInvitationEmail(input: {
  email: string;
  name?: string | null;
  roleLabel: string;
  invitationUrl: string;
  inviterName: string;
}): Promise<EmailResult> {
  const safeName = escapeHtml(input.name?.trim() || 'there');
  const safeRole = escapeHtml(input.roleLabel);
  const safeInviter = escapeHtml(input.inviterName);
  const safeUrl = escapeHtml(input.invitationUrl);

  try {
    const result = await getResend().emails.send({
      ...senderOptions(),
      to: input.email,
      subject: `You're invited to VoteKit as ${input.roleLabel.replace(/[\r\n]+/g, ' ').trim()}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h1 style="color: #00843D; margin: 0 0 24px;">VoteKit Election Platform</h1>
          <div style="background: #f8f9fa; border-radius: 10px; padding: 28px;">
            <h2 style="color: #1B5E20; margin-top: 0;">You're invited</h2>
            <p>Hello ${safeName},</p>
            <p>${safeInviter} has invited you to join VoteKit as <strong>${safeRole}</strong>.</p>
            <p style="margin: 28px 0;">
              <a href="${safeUrl}" style="background: #00843D; color: #fff; text-decoration: none; padding: 13px 22px; border-radius: 6px; display: inline-block; font-weight: bold;">Accept invitation</a>
            </p>
            <p style="color: #666; font-size: 14px;">This private, single-use invitation expires in 48 hours. If you were not expecting it, you can ignore this email.</p>
          </div>
        </div>
      `,
      text: `VoteKit Election Platform\n\nHello ${input.name?.trim() || 'there'},\n\n${input.inviterName} has invited you to join VoteKit as ${input.roleLabel}.\n\nAccept your invitation: ${input.invitationUrl}\n\nThis private, single-use invitation expires in 48 hours.`
    });
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error('Failed to send admin invitation email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

export async function sendVoterLinkEmail(input: { email: string; electionTitle: string; electionDescription: string; ballotUrl: string; reminder?: boolean; closeDate?: string }): Promise<EmailResult> {
  const safeTitle = escapeHtml(input.electionTitle);
  const safeDescription = escapeHtml(input.electionDescription.slice(0, 500));
  const safeUrl = escapeHtml(input.ballotUrl);
  const subject = `${input.reminder ? 'Reminder: ' : ''}Your VoteKit ballot - ${input.electionTitle.replace(/[\r\n]+/g, ' ')}`;
  try {
    const result = await getResend().emails.send({
      ...senderOptions(), to: input.email, subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px"><h1 style="color:#00843D">VoteKit</h1><h2>${input.reminder ? 'Voting reminder' : 'Your ballot is ready'}</h2><p>You are invited to vote in <strong>${safeTitle}</strong>.</p><p>${safeDescription}</p><p style="margin:28px 0"><a href="${safeUrl}" style="background:#00843D;color:white;text-decoration:none;padding:13px 22px;border-radius:6px;font-weight:bold">Open your ballot</a></p><p style="color:#666;font-size:14px">This private link is tied to your voter registration. VoteKit separates your identity from your ballot when it is submitted.</p></div>`,
      text: `VoteKit\n\n${input.reminder ? 'Voting reminder' : 'Your ballot is ready'}\n\n${input.electionTitle}\n\n${input.electionDescription.slice(0, 500)}\n\nOpen your ballot: ${input.ballotUrl}`
    });
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error('Failed to send voter link email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

// Database-backed rate limiting
function positiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_EMAIL_ATTEMPTS = positiveIntegerEnv('MAX_VERIFICATION_EMAIL_ATTEMPTS', 3);
const RATE_LIMIT_WINDOW_HOURS = 1;

// Defaults tolerate shared office/event networks and large election openings.
// Per-email throttling remains the primary delivery-abuse control.
export const MAX_VERIFICATION_IP_ATTEMPTS = positiveIntegerEnv('MAX_VERIFICATION_IP_ATTEMPTS', 500);
export const MAX_VERIFICATION_GLOBAL_ATTEMPTS = positiveIntegerEnv('MAX_VERIFICATION_GLOBAL_ATTEMPTS', 5000);

export function isRateLimitKeyLimited(key: string, maxAttempts: number): boolean {
  cleanupEmailRateLimit();
  const record = db.prepare(`
    SELECT attempt_count FROM email_rate_limits
    WHERE email = ? AND reset_time > ?
  `).get(key, new Date().toISOString()) as { attempt_count: number } | undefined;

  return record ? record.attempt_count >= maxAttempts : false;
}

export function incrementRateLimitKey(key: string): void {
  const now = new Date();
  const resetTime = new Date(now.getTime() + (RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000));

  const updated = db.prepare(`
    UPDATE email_rate_limits
    SET attempt_count = attempt_count + 1
    WHERE email = ? AND reset_time > ?
  `).run(key, now.toISOString());

  if (updated.changes === 0) {
    db.prepare(`
      INSERT INTO email_rate_limits (email, attempt_count, reset_time)
      VALUES (?, 1, ?)
    `).run(key, resetTime.toISOString());
  }
}

export function getRemainingRateLimitAttempts(key: string, maxAttempts: number): number {
  const record = db.prepare(`
    SELECT attempt_count FROM email_rate_limits
    WHERE email = ? AND reset_time > ?
  `).get(key, new Date().toISOString()) as { attempt_count: number } | undefined;

  if (!record) return maxAttempts;
  return Math.max(0, maxAttempts - record.attempt_count);
}

export function isEmailRateLimited(email: string): boolean {
  return isRateLimitKeyLimited(email, MAX_EMAIL_ATTEMPTS);
}

export function incrementEmailAttempts(email: string): void {
  incrementRateLimitKey(email);
}

export function getRemainingEmailAttempts(email: string): number {
  return getRemainingRateLimitAttempts(email, MAX_EMAIL_ATTEMPTS);
}

// Cleanup function to remove expired rate limit entries
export function cleanupEmailRateLimit(): void {
  db.prepare('DELETE FROM email_rate_limits WHERE reset_time <= ?')
    .run(new Date().toISOString());
}

// Generate 6-digit verification code
export function generateVerificationCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

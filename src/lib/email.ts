import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import db from './db';

// --- Email Transport Layer ---
// Priority: SMTP env vars > Resend API key > disabled

interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function isResendConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 'dummy');
}

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || 'dummy');
  }
  return _resend;
}

let _transporter: nodemailer.Transporter | null = null;
function getSmtpTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return _transporter;
}

async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; error?: string; messageId?: string }> {
  if (isSmtpConfigured()) {
    try {
      const info = await getSmtpTransporter().sendMail({
        from: params.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('SMTP send failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'SMTP error' };
    }
  }

  if (isResendConfigured()) {
    try {
      const result = await getResend().emails.send({
        from: params.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });
      return { success: true, messageId: result.data?.id };
    } catch (error) {
      console.error('Resend send failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Resend error' };
    }
  }

  return { success: false, error: 'No email provider configured. Set SMTP_HOST/SMTP_USER/SMTP_PASS for SMTP, or RESEND_API_KEY for Resend.' };
}

// --- Public API ---

export interface EmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

export async function sendVerificationEmail(
  email: string,
  code: string,
  plebisciteTitle: string
): Promise<EmailResult> {
  const fromEmail = process.env.FROM_EMAIL || 'noreply@example.com';

  return sendEmail({
    from: fromEmail,
    to: email,
    subject: `Verification Code: ${plebisciteTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #00843D; margin: 0;">VoteKit Election Platform</h1>
        </div>
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
          <h2 style="color: #1B5E20; margin-top: 0;">Verification Required</h2>
          <p style="color: #333; font-size: 16px; line-height: 1.5;">
            You have requested to participate in the election: <strong>${plebisciteTitle}</strong>
          </p>
          <p style="color: #333; font-size: 16px; line-height: 1.5;">Your verification code is:</p>
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
          <p style="color: #999; font-size: 12px; margin: 0;">This is an automated message from VoteKit.</p>
        </div>
      </div>
    `,
    text: `VoteKit Election Platform\n\nVerification Required\n\nYou have requested to participate in the election: ${plebisciteTitle}\n\nYour verification code is: ${code}\n\nThis code will expire in 10 minutes. If you did not request this code, please ignore this email.`
  });
}

export async function sendBallotLinkEmail(
  email: string,
  plebisciteTitle: string,
  plebisciteDescription: string,
  ballotUrl: string
): Promise<EmailResult> {
  const fromEmail = process.env.FROM_EMAIL || 'noreply@example.com';
  const descSnippet = plebisciteDescription.substring(0, 300) + (plebisciteDescription.length > 300 ? '...' : '');

  return sendEmail({
    from: fromEmail,
    to: email,
    subject: `Your Ballot: ${plebisciteTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #00843D; margin: 0;">VoteKit Election Platform</h1>
        </div>
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
          <h2 style="color: #1B5E20; margin-top: 0;">Your Ballot is Ready</h2>
          <p style="color: #333; font-size: 16px; line-height: 1.5;">You are invited to vote in: <strong>${plebisciteTitle}</strong></p>
          <p style="color: #666; font-size: 14px; line-height: 1.5;">${descSnippet}</p>
          <div style="text-align: center; margin: 25px 0;">
            <a href="${ballotUrl}" style="background-color: #00843D; color: white; font-size: 18px; font-weight: bold; padding: 15px 30px; border-radius: 5px; text-decoration: none; display: inline-block;">Cast Your Vote</a>
          </div>
          <p style="color: #666; font-size: 14px; line-height: 1.4; text-align: center;">Or copy this link: <a href="${ballotUrl}" style="color: #00843D;">${ballotUrl}</a></p>
        </div>
        <div style="background-color: #e8f5e9; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
          <p style="color: #1B5E20; font-size: 14px; margin: 0;"><strong>Secure &amp; Private:</strong> This unique link is tied to your voter registration. Your vote is anonymous once submitted.</p>
        </div>
        <div style="border-top: 1px solid #e0e0e0; padding-top: 20px; text-align: center;">
          <p style="color: #999; font-size: 12px; margin: 0;">This is an automated message from VoteKit. Do not reply to this email.</p>
        </div>
      </div>
    `,
    text: `VoteKit Election Platform\n\nYour Ballot is Ready\n\nYou are invited to vote in: ${plebisciteTitle}\n\n${descSnippet}\n\nCast your vote here: ${ballotUrl}\n\nThis unique link is tied to your voter registration. Your vote is anonymous once submitted.`
  });
}

export async function sendReminderEmail(
  email: string,
  plebisciteTitle: string,
  plebisciteDescription: string,
  ballotUrl: string,
  closeDate: string
): Promise<EmailResult> {
  const fromEmail = process.env.FROM_EMAIL || 'noreply@example.com';
  const descSnippet = plebisciteDescription.substring(0, 200) + (plebisciteDescription.length > 200 ? '...' : '');
  const formattedCloseDate = new Date(closeDate).toLocaleDateString('en-AU', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Brisbane'
  });

  return sendEmail({
    from: fromEmail,
    to: email,
    subject: `Reminder: Cast your vote - ${plebisciteTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #00843D; margin: 0;">VoteKit Election Platform</h1>
        </div>
        <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
          <p style="color: #856404; font-size: 14px; margin: 0;"><strong>Reminder:</strong> You haven't voted yet! Voting closes on ${formattedCloseDate}.</p>
        </div>
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
          <h2 style="color: #1B5E20; margin-top: 0;">Don't Forget to Vote</h2>
          <p style="color: #333; font-size: 16px; line-height: 1.5;">You're registered to vote in: <strong>${plebisciteTitle}</strong></p>
          <p style="color: #666; font-size: 14px; line-height: 1.5;">${descSnippet}</p>
          <div style="text-align: center; margin: 25px 0;">
            <a href="${ballotUrl}" style="background-color: #00843D; color: white; font-size: 18px; font-weight: bold; padding: 15px 30px; border-radius: 5px; text-decoration: none; display: inline-block;">Vote Now</a>
          </div>
          <p style="color: #666; font-size: 14px; line-height: 1.4; text-align: center;">Your unique voting link: <a href="${ballotUrl}" style="color: #00843D;">${ballotUrl}</a></p>
        </div>
        <div style="border-top: 1px solid #e0e0e0; padding-top: 20px; text-align: center;">
          <p style="color: #999; font-size: 12px; margin: 0;">This is an automated reminder from VoteKit. Do not reply to this email.</p>
        </div>
      </div>
    `,
    text: `VoteKit Election Platform\n\nREMINDER: You haven't voted yet!\nVoting closes on ${formattedCloseDate}.\n\nYou're registered to vote in: ${plebisciteTitle}\n\n${descSnippet}\n\nVote now: ${ballotUrl}`
  });
}

// --- Rate Limiting (unchanged) ---

const MAX_EMAIL_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW_HOURS = 1;

export function isEmailRateLimited(email: string): boolean {
  cleanupEmailRateLimit();
  const record = db.prepare('SELECT attempt_count, reset_time FROM email_rate_limits WHERE email = ? AND reset_time > ?')
    .get(email, new Date().toISOString()) as { attempt_count: number; reset_time: string } | undefined;
  return record ? record.attempt_count >= MAX_EMAIL_ATTEMPTS : false;
}

export function incrementEmailAttempts(email: string): void {
  const now = new Date();
  const resetTime = new Date(now.getTime() + (RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000));
  const updated = db.prepare('UPDATE email_rate_limits SET attempt_count = attempt_count + 1 WHERE email = ? AND reset_time > ?')
    .run(email, now.toISOString());
  if (updated.changes === 0) {
    db.prepare('INSERT INTO email_rate_limits (email, attempt_count, reset_time) VALUES (?, 1, ?)').run(email, resetTime.toISOString());
  }
}

export function getRemainingEmailAttempts(email: string): number {
  const record = db.prepare('SELECT attempt_count FROM email_rate_limits WHERE email = ? AND reset_time > ?')
    .get(email, new Date().toISOString()) as { attempt_count: number } | undefined;
  if (!record) return MAX_EMAIL_ATTEMPTS;
  return Math.max(0, MAX_EMAIL_ATTEMPTS - record.attempt_count);
}

export function cleanupEmailRateLimit(): void {
  db.prepare('DELETE FROM email_rate_limits WHERE reset_time <= ?').run(new Date().toISOString());
}

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

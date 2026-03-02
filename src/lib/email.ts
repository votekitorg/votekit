import { Resend } from 'resend';
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

export async function sendVerificationEmail(
  email: string,
  code: string,
  plebisciteTitle: string
): Promise<EmailResult> {
  const fromEmail = process.env.FROM_EMAIL || 'noreply@example.com';
  
  try {
    const result = await getResend().emails.send({
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

// Database-backed rate limiting
const MAX_EMAIL_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW_HOURS = 1;

export function isEmailRateLimited(email: string): boolean {
  // Clean up expired rate limits first
  cleanupEmailRateLimit();
  
  const record = db.prepare(`
    SELECT attempt_count, reset_time FROM email_rate_limits 
    WHERE email = ? AND reset_time > ?
  `).get(email, new Date().toISOString()) as { attempt_count: number; reset_time: string } | undefined;
  
  return record ? record.attempt_count >= MAX_EMAIL_ATTEMPTS : false;
}

export function incrementEmailAttempts(email: string): void {
  const now = new Date();
  const resetTime = new Date(now.getTime() + (RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000));
  
  // Try to update existing record first
  const updated = db.prepare(`
    UPDATE email_rate_limits 
    SET attempt_count = attempt_count + 1 
    WHERE email = ? AND reset_time > ?
  `).run(email, now.toISOString());
  
  // If no existing record, create a new one
  if (updated.changes === 0) {
    db.prepare(`
      INSERT INTO email_rate_limits (email, attempt_count, reset_time)
      VALUES (?, 1, ?)
    `).run(email, resetTime.toISOString());
  }
}

export function getRemainingEmailAttempts(email: string): number {
  const record = db.prepare(`
    SELECT attempt_count FROM email_rate_limits 
    WHERE email = ? AND reset_time > ?
  `).get(email, new Date().toISOString()) as { attempt_count: number } | undefined;
  
  if (!record) {
    return MAX_EMAIL_ATTEMPTS;
  }
  
  return Math.max(0, MAX_EMAIL_ATTEMPTS - record.attempt_count);
}

// Cleanup function to remove expired rate limit entries
export function cleanupEmailRateLimit(): void {
  db.prepare('DELETE FROM email_rate_limits WHERE reset_time <= ?')
    .run(new Date().toISOString());
}

// Generate 6-digit verification code
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
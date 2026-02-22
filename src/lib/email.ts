import { Resend } from 'resend';

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
            <h1 style="color: #00843D; margin: 0;">Member Plebiscite Platform</h1>
          </div>
          
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
            <h2 style="color: #1B5E20; margin-top: 0;">Verification Required</h2>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">
              You have requested to participate in the plebiscite: <strong>${plebisciteTitle}</strong>
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
              This is an automated message from the Member Plebiscite Platform.
            </p>
          </div>
        </div>
      `,
      text: `
        Member Plebiscite Platform
        
        Verification Required
        
        You have requested to participate in the plebiscite: ${plebisciteTitle}
        
        Your verification code is: ${code}
        
        This code will expire in 10 minutes. If you did not request this code, please ignore this email.
        
        This is an automated message from the Member Plebiscite Platform.
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

// Rate limiting helper
const emailAttempts = new Map<string, { count: number; resetTime: number }>();

export function isEmailRateLimited(email: string): boolean {
  const now = Date.now();
  const attempts = emailAttempts.get(email);
  
  if (!attempts || now > attempts.resetTime) {
    // Reset counter if time window has passed
    emailAttempts.set(email, { count: 0, resetTime: now + (60 * 60 * 1000) }); // 1 hour window
    return false;
  }
  
  return attempts.count >= 3; // Max 3 codes per hour
}

export function incrementEmailAttempts(email: string): void {
  const now = Date.now();
  const attempts = emailAttempts.get(email);
  
  if (!attempts || now > attempts.resetTime) {
    emailAttempts.set(email, { count: 1, resetTime: now + (60 * 60 * 1000) });
  } else {
    attempts.count++;
  }
}

export function getRemainingEmailAttempts(email: string): number {
  const attempts = emailAttempts.get(email);
  if (!attempts || Date.now() > attempts.resetTime) {
    return 3;
  }
  return Math.max(0, 3 - attempts.count);
}

// Cleanup function to remove expired rate limit entries
export function cleanupEmailRateLimit(): void {
  const now = Date.now();
  for (const [email, attempts] of emailAttempts.entries()) {
    if (now > attempts.resetTime) {
      emailAttempts.delete(email);
    }
  }
}

// Generate 6-digit verification code
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
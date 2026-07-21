import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import db from '@/lib/db';

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });

  const webhookId = request.headers.get('svix-id') || '';
  const timestamp = request.headers.get('svix-timestamp') || '';
  const signature = request.headers.get('svix-signature') || '';
  const payload = await request.text();
  if (!webhookId || !timestamp || !signature) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });

  try {
    const event = new Resend(process.env.RESEND_API_KEY || '').webhooks.verify({
      payload,
      headers: { id: webhookId, timestamp, signature },
      webhookSecret
    });

    db.transaction(() => {
      const inserted = db.prepare('INSERT OR IGNORE INTO email_webhook_events (id, event_type) VALUES (?, ?)')
        .run(webhookId, event.type);
      if (inserted.changes === 0) return;

      if (event.type === 'email.bounced' || event.type === 'email.complained') {
        const reason = event.type === 'email.bounced' ? 'bounce' : 'complaint';
        const suppress = db.prepare(`INSERT INTO email_suppressions
          (email, reason, provider_message_id) VALUES (?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET reason = excluded.reason,
            provider_message_id = excluded.provider_message_id, updated_at = CURRENT_TIMESTAMP`);
        for (const recipient of event.data.to) suppress.run(recipient.toLowerCase(), reason, event.data.email_id);
      }

      if (event.type === 'email.failed' || event.type === 'email.suppressed') {
        const detail = event.type === 'email.failed' ? event.data.failed.reason : event.data.suppressed.message;
        db.prepare(`UPDATE email_jobs SET status = 'failed', last_error = ?
          WHERE provider_message_id = ? AND status = 'sent'`).run(detail.slice(0, 500), event.data.email_id);
      }
    })();

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
}

import fs from 'node:fs';
import { Resend } from 'resend';

const envPath = process.env.VOTEKIT_ENV_PATH || '/etc/votekit/votekit.env';
const endpoint = `${new URL(process.env.VOTEKIT_PUBLIC_URL).origin}/api/webhooks/resend`;
const events = ['email.delivered', 'email.delivery_delayed', 'email.bounced', 'email.complained', 'email.failed', 'email.suppressed'];
const resend = new Resend(process.env.RESEND_API_KEY);

const listed = await resend.webhooks.list({ limit: 100 });
if (listed.error || !listed.data) throw new Error(listed.error?.message || 'Could not list Resend webhooks');
const existing = listed.data.data.find(webhook => webhook.endpoint === endpoint);
let signingSecret;

if (existing) {
  const updated = await resend.webhooks.update(existing.id, { events, status: 'enabled' });
  if (updated.error) throw new Error(updated.error.message);
  const details = await resend.webhooks.get(existing.id);
  if (details.error || !details.data) throw new Error(details.error?.message || 'Could not read Resend webhook');
  signingSecret = details.data.signing_secret;
} else {
  const created = await resend.webhooks.create({ endpoint, events });
  if (created.error || !created.data) throw new Error(created.error?.message || 'Could not create Resend webhook');
  signingSecret = created.data.signing_secret;
}

if (!signingSecret || /[\r\n]/u.test(signingSecret)) throw new Error('Resend returned an invalid webhook secret');
const stat = fs.statSync(envPath);
const current = fs.readFileSync(envPath, 'utf8');
const line = `RESEND_WEBHOOK_SECRET=${signingSecret}`;
const next = /^RESEND_WEBHOOK_SECRET=.*$/mu.test(current)
  ? current.replace(/^RESEND_WEBHOOK_SECRET=.*$/mu, line)
  : `${current.replace(/\s*$/u, '\n')}${line}\n`;
const temporary = `${envPath}.tmp-${process.pid}`;
fs.writeFileSync(temporary, next, { mode: stat.mode });
fs.chownSync(temporary, stat.uid, stat.gid);
fs.renameSync(temporary, envPath);
console.log(existing ? 'Updated VoteKit Resend webhook configuration' : 'Created VoteKit Resend webhook configuration');

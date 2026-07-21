# Durable email delivery

Bulk voter links and reminders are inserted transactionally into the SQLite
`email_jobs` queue. Private links are encrypted at rest with AES-256-GCM and
the plaintext payload is removed after Resend accepts the batch.

The dedicated systemd worker leases fixed groups of at most 100 jobs, sends
them through Resend's batch endpoint with an idempotency key, and retries
transient failures up to five times with exponential backoff. A fixed batch ID
is retained across retries so an ambiguous network failure cannot create a new
idempotency key. The worker limits itself to about 1.3 API requests per second,
reserving most of the account's 10 requests per second for interactive voting
and results verification codes, which continue to send immediately.

Signed Resend webhooks record provider failures and automatically suppress
addresses that bounce or complain. Election managers see pending, sent, failed,
and suppressed totals on the voter-management screen. Starting a newer mailing
invalidates still-queued older links before rotating voter-link tokens.

Operational requirements:

- `EMAIL_QUEUE_ENCRYPTION_KEY` is exactly 32 random bytes encoded as hex or Base64.
- Do not rotate that key while any email jobs are queued or processing.
- `RESEND_WEBHOOK_SECRET` is installed by `scripts/configure-resend-webhook.mjs`.
- `votekit-email-worker.service` must run alongside `votekit.service`.
- OTP delivery logs and failed/suppressed queue counts should be monitored during elections.

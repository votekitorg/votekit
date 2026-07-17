# VoteKit Deployment Runbook

## Source of truth

GitHub is the source of truth. Production must run an immutable Git commit from
`votekitorg/votekit`, preferably an annotated release tag. A developer
workspace and files edited directly on the server are never release sources.

The deployed commit is exposed by `GET /api/health` as `release`. A release is
successful only when that value matches the requested Git commit.

## Supported topology

- One persistent Linux server
- Node.js 20.9 or newer
- nginx terminating HTTPS and proxying to `127.0.0.1:3000`
- One VoteKit process
- SQLite stored at `/var/lib/votekit/plebiscite.db`
- Secrets stored at `/etc/votekit/votekit.env` with mode `0600`
- Immutable code releases under `/opt/votekit-releases/<commit>`
- `/opt/votekit-current` symlink pointing to the active release

Multiple application processes, containers with separate local filesystems,
Vercel, and other serverless deployments are unsupported for real elections.

## One-time server setup

1. Create the `votekit` system user.
2. Install Node.js, npm, git, sqlite3, nginx, and curl.
3. Create `/etc/votekit/votekit.env` from `.env.example`. Use a durable absolute
   `DATABASE_PATH`, verified email sender, strong bootstrap credentials, and
   `TRUST_PROXY_HEADERS=true` only with the supplied localhost nginx topology.
4. Install `deploy/votekit.service` as `/etc/systemd/system/votekit.service`.
5. Install `deploy/nginx-votekit.conf` as the nginx site after certificates exist.
6. Install `deploy/backup.sh` as `/usr/local/sbin/votekit-backup`.
7. Schedule local hot backups and arrange encrypted off-server replication.
8. Set `VOTEKIT_PUBLIC_URL` to the canonical HTTPS origin used in administrator
   invitation links. Do not derive invitation origins from request Host headers.
9. Enable the service only after the first tagged release has been deployed.

## Release procedure

1. Confirm the candidate branch is clean.
2. Run `npm ci`, `npm run lint`, `npm test`, `npm run regression-check`,
   `npm run type-check`, `npm run build`, and `npm audit --audit-level=moderate`.
3. Review database migration and rollback implications.
4. Merge and push the approved commit.
5. Create an annotated release tag.
6. On production, run `deploy-release.sh <tag>`.
7. Verify `/api/health`, main pages, admin login, and a test election flow.
8. Verify the backup produced immediately before deployment.

## Git-driven release pipeline

The normal production path is automated but deliberately not continuous:

1. Candidate changes are tested before merging to `main`.
2. An approved commit is given an annotated stable semantic-version tag such as
   `v0.2.0`. Pushing `main` alone never changes production.
3. A hardened production timer checks the public Git tag feed every five minutes.
   It considers only annotated `vMAJOR.MINOR.PATCH` tags and selects the highest
   version. GitHub holds no production SSH key, and production exposes no CI login.
5. Production independently clones the public repository, checks out that exact
   SHA, rebuilds, re-runs the gates, backs up SQLite, atomically switches the
   release symlink, and rolls back the code pointer if health verification fails.
6. The server deployment script and public health endpoint both verify the exact
   tagged commit SHA. Failures roll the code symlink back automatically.

Creating and pushing the annotated version tag is the explicit release approval
action. GitHub Actions CI is a useful future enhancement, but the available
repository token cannot administer workflow files. The production deployment
script independently repeats every release quality gate before switching code.

The deployment script checks out the exact ref, repeats the quality gates,
backs up SQLite with its online backup API, switches the release symlink,
restarts the service, verifies the reported release SHA, and rolls back the
code symlink if health verification fails. Database migrations must remain
backward compatible because code rollback does not reverse schema changes.

## Election-day gate

- Restore the latest backup into an isolated path and run `PRAGMA quick_check`.
- Confirm the voter roll and question wording with the election owner.
- Confirm the close time displayed in Australia/Brisbane.
- Confirm the sender domain delivers to representative providers.
- Confirm admins and observers have the intended roles.
- Run a complete rehearsal: authenticate, vote, close, verify receipt, export,
  and independently re-tally.
- Record the deployed release SHA and database backup filename.

## Rollback

If health verification fails during deployment, the script restores the
previous code symlink. For a later rollback, point `/opt/votekit-current` to a
known release, update `/etc/votekit/release.env`, restart the service, and
verify `/api/health`. Restore a database backup only after preserving the
current database and confirming the migration compatibility decision.

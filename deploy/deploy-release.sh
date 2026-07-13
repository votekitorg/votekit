#!/usr/bin/env bash
set -Eeuo pipefail

REF="${1:?Usage: deploy-release.sh <git-tag-or-commit>}"
REPOSITORY="https://github.com/votekitorg/votekit.git"
RELEASE_ROOT="/opt/votekit-releases"
CURRENT_LINK="/opt/votekit-current"
RELEASE_ENV="/etc/votekit/release.env"
HEALTH_URL="https://votekit.org/api/health"

if [[ "$EUID" -ne 0 ]]; then
  echo "Run as root so the release symlink and service can be updated" >&2
  exit 1
fi

install -d -m 0755 "$RELEASE_ROOT"
install -d -m 0750 -o votekit -g votekit /var/lib/votekit /var/backups/votekit
install -d -m 0750 /etc/votekit

INCOMING="$RELEASE_ROOT/.incoming-$(date -u +%s)-$$"
trap 'if [[ -d "$INCOMING" ]]; then rm -rf -- "$INCOMING"; fi' EXIT

git clone --quiet --no-checkout "$REPOSITORY" "$INCOMING"
git -C "$INCOMING" fetch --quiet --depth=1 origin "$REF"
git -C "$INCOMING" checkout --quiet --detach FETCH_HEAD
RELEASE_SHA="$(git -C "$INCOMING" rev-parse HEAD)"
RELEASE_DIR="$RELEASE_ROOT/$RELEASE_SHA"

if [[ -e "$RELEASE_DIR" ]]; then
  echo "Release already exists: $RELEASE_SHA" >&2
  exit 1
fi

chown -R votekit:votekit "$INCOMING"
sudo -u votekit npm --prefix "$INCOMING" ci

export DATABASE_PATH=:memory:
export VOTEKIT_RELEASE="$RELEASE_SHA"
sudo -u votekit --preserve-env=DATABASE_PATH,VOTEKIT_RELEASE npm --prefix "$INCOMING" run lint
sudo -u votekit --preserve-env=DATABASE_PATH,VOTEKIT_RELEASE npm --prefix "$INCOMING" test
sudo -u votekit --preserve-env=DATABASE_PATH,VOTEKIT_RELEASE npm --prefix "$INCOMING" run regression-check
sudo -u votekit --preserve-env=DATABASE_PATH,VOTEKIT_RELEASE npm --prefix "$INCOMING" run type-check
sudo -u votekit --preserve-env=DATABASE_PATH,VOTEKIT_RELEASE npm --prefix "$INCOMING" run build
unset DATABASE_PATH

/usr/local/sbin/votekit-backup

PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
mv "$INCOMING" "$RELEASE_DIR"
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK.next"
mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
printf 'VOTEKIT_RELEASE=%s\n' "$RELEASE_SHA" > "$RELEASE_ENV"
chmod 0644 "$RELEASE_ENV"

systemctl restart votekit.service

if ! HEALTH="$(curl --fail --silent --show-error --retry 10 --retry-delay 2 "$HEALTH_URL")" ||
   [[ "$HEALTH" != *"\"release\":\"$RELEASE_SHA\""* ]]; then
  echo "Release health check failed; rolling back" >&2
  if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK.next"
    mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
    printf 'VOTEKIT_RELEASE=%s\n' "$(basename "$PREVIOUS_RELEASE")" > "$RELEASE_ENV"
    systemctl restart votekit.service
  fi
  exit 1
fi

trap - EXIT
printf 'Deployed VoteKit release %s\n' "$RELEASE_SHA"

#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY="https://github.com/votekitorg/votekit.git"
DEPLOY_SCRIPT="/usr/local/lib/votekit/deploy-release.sh"
HEALTH_URL="https://votekit.org/api/health"

exec 9>/run/lock/votekit-release-watcher.lock
flock -n 9 || exit 0

# Only peeled refs are accepted, which excludes lightweight tags. Version sort
# selects the highest stable semantic version rather than trusting API ordering.
TAG_AND_SHA="$(git ls-remote --tags "$REPOSITORY" | awk '
  $2 ~ /^refs\/tags\/v[0-9]+\.[0-9]+\.[0-9]+\^\{\}$/ {
    ref=$2; sub(/^refs\/tags\//, "", ref); sub(/\^\{\}$/, "", ref); print ref, $1
  }
' | sort -V | tail -n 1)"
TAG="${TAG_AND_SHA%% *}"
RELEASE_SHA="${TAG_AND_SHA##* }"

if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Refusing unexpected VoteKit release tag: $TAG" >&2
  exit 1
fi

if [[ ! "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Release $TAG is not an annotated tag with a resolvable commit" >&2
  exit 1
fi

CURRENT_RELEASE="$(curl --fail --silent --show-error "$HEALTH_URL" 2>/dev/null | \
  node -e 'let d=""; process.stdin.on("data",c=>d+=c); process.stdin.on("end",()=>{try{process.stdout.write(JSON.parse(d).release||"")}catch{}})' || true)"
if [[ "$CURRENT_RELEASE" == "$RELEASE_SHA" ]]; then
  exit 0
fi

echo "Deploying approved VoteKit release $TAG ($RELEASE_SHA)"
"$DEPLOY_SCRIPT" "$RELEASE_SHA"

#!/usr/bin/env bash
# Runs in GitHub Actions after the image is pushed to GHCR: copies the server
# files from deploy/ to the server and runs deploy.sh there.
#
# Env: DEPLOY_HOST, DEPLOY_USER, DEPLOY_KNOWN_HOSTS (repository variables),
#      DEPLOY_SSH_KEY (secret), IMAGE_TAG, GHCR_USER, GHCR_TOKEN
set -euo pipefail

: "${DEPLOY_HOST:?}" "${DEPLOY_USER:?}" "${DEPLOY_KNOWN_HOSTS:?}" "${DEPLOY_SSH_KEY:?}"
: "${IMAGE_TAG:?}" "${GHCR_USER:?}" "${GHCR_TOKEN:?}"

readonly REMOTE_DIR="/opt/personal-crm"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ssh_dir="$(mktemp -d)"
trap 'rm -rf "$ssh_dir"' EXIT
(umask 077 && printf '%s\n' "$DEPLOY_SSH_KEY" > "$ssh_dir/key")
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$ssh_dir/known_hosts"

ssh_opts=(
  -i "$ssh_dir/key"
  -o IdentitiesOnly=yes
  -o BatchMode=yes
  -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile="$ssh_dir/known_hosts"
)
target="$DEPLOY_USER@$DEPLOY_HOST"

echo "==> Copying deploy files to $REMOTE_DIR on the server"
scp "${ssh_opts[@]}" "$script_dir/compose.yaml" "$script_dir/deploy.sh" \
  "$target:$REMOTE_DIR/"

echo "==> Running deploy.sh $IMAGE_TAG on the server"
printf '%s\n' "$GHCR_TOKEN" \
  | ssh "${ssh_opts[@]}" "$target" "bash $REMOTE_DIR/deploy.sh $IMAGE_TAG $GHCR_USER"

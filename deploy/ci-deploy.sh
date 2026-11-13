#!/usr/bin/env bash
# Runs in GitHub Actions after the image is pushed to GHCR: copies the whole
# deploy/ folder to the server (a new script there ships by itself) and runs
# deploy.sh there for one environment.
#
#   ci-deploy.sh <prod|staging>
#
# Env: DEPLOY_HOST, DEPLOY_USER, DEPLOY_KNOWN_HOSTS (repository variables),
#      DEPLOY_SSH_KEY (secret), IMAGE_TAG, GHCR_USER, GHCR_TOKEN
set -euo pipefail

env_name="${1:-}"
if [[ "$env_name" != prod && "$env_name" != staging ]]; then
  echo "Usage: ci-deploy.sh <prod|staging>" >&2
  exit 2
fi
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

# The deploys to prod and to the test stand run at the same time, and a script on
# the server may be running right now (the other deploy, or restore.sh waiting for
# "yes"). Writing over a running script can make bash read half of the new file.
# So the files are unpacked into a new folder first and then moved into place:
# a running script keeps reading its own, old copy.
echo "==> Copying deploy/ to $REMOTE_DIR on the server"
# shellcheck disable=SC2016
tar -C "$script_dir" -cf - . | ssh "${ssh_opts[@]}" "$target" \
  'set -e; dir="$(mktemp -d '"$REMOTE_DIR"'/.upload.XXXXXX)"; trap "rm -rf \"$dir\"" EXIT;
   tar -C "$dir" -xf -; mv -f "$dir"/* '"$REMOTE_DIR"'/'

echo "==> Running deploy.sh $env_name $IMAGE_TAG on the server"
printf '%s\n' "$GHCR_TOKEN" \
  | ssh "${ssh_opts[@]}" "$target" "bash $REMOTE_DIR/deploy.sh $env_name $IMAGE_TAG $GHCR_USER"

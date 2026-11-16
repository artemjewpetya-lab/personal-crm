#!/usr/bin/env bash
# Runs in GitHub Actions after the image is in GHCR: copies the whole deploy/
# folder this script lies in to the server (a new script there ships by itself)
# and runs deploy.sh there for one environment.
#
#   ci-deploy.sh <prod|staging>
#
# Deploy staging runs it from the commit just merged. Deploy prod runs it from the
# commit it deploys (also on a rollback), so prod gets the deploy scripts of the same
# version as the image. Keep the call and the variables the same: Deploy prod runs
# the copy of this script from older commits too.
#
# Env: DEPLOY_HOST, DEPLOY_USER, DEPLOY_KNOWN_HOSTS (repository variables),
#      DEPLOY_SSH_KEY (secret), IMAGE_TAG, GHCR_USER, GHCR_TOKEN
set -euo pipefail

env_name="${1:-}"
if [[ "$env_name" != prod && "$env_name" != staging ]]; then
  echo "Usage: ci-deploy.sh <prod|staging>" >&2
  exit 2
fi
: "${IMAGE_TAG:?}" "${GHCR_USER:?}" "${GHCR_TOKEN:?}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci-ssh.sh
source "$script_dir/ci-ssh.sh"

# The deploys to prod and to the test stand may run at the same time, and a script
# on the server may be running right now (the other deploy, the daily backup, or
# restore.sh waiting for "yes"). Writing over a running script can make bash read
# half of the new file. So the files are unpacked into a new folder first and then
# moved into place: a running script keeps reading its own, old copy.
# deploy/ must have no subfolders: mv cannot replace a folder that is not empty.
echo "==> Copying deploy/ to $REMOTE_DIR on the server"
# shellcheck disable=SC2016
tar -C "$script_dir" -cf - . | ssh "${SSH_OPTS[@]}" "$SSH_TARGET" \
  'set -e; dir="$(mktemp -d '"$REMOTE_DIR"'/.upload.XXXXXX)"; trap "rm -rf \"$dir\"" EXIT;
   tar -C "$dir" -xf -; mv -f "$dir"/* '"$REMOTE_DIR"'/'

echo "==> Running deploy.sh $env_name $IMAGE_TAG on the server"
# shellcheck disable=SC2029 # expanded here on purpose
printf '%s\n' "$GHCR_TOKEN" \
  | ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "bash $REMOTE_DIR/deploy.sh $env_name $IMAGE_TAG $GHCR_USER"

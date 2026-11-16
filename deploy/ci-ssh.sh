# shellcheck shell=bash
# Shared by the scripts that run in GitHub Actions and go to the server over ssh
# (ci-deploy.sh, ci-prod-version.sh; sourced, not run). Writes the deploy key and
# the server's host key into a temporary folder, removed when the script exits
# (this sets the EXIT trap: the caller must not set its own), and sets:
#   SSH_OPTS - the ssh options for that key and host key (an array)
#   SSH_TARGET - user@host of the server
#   REMOTE_DIR - the app folder on the server
# Env: DEPLOY_HOST, DEPLOY_USER, DEPLOY_KNOWN_HOSTS (repository variables),
#      DEPLOY_SSH_KEY (secret)

: "${DEPLOY_HOST:?}" "${DEPLOY_USER:?}" "${DEPLOY_KNOWN_HOSTS:?}" "${DEPLOY_SSH_KEY:?}"

# shellcheck disable=SC2034 # used by the scripts that source this file
readonly REMOTE_DIR="/opt/personal-crm"

ssh_dir="$(mktemp -d)"
trap 'rm -rf "$ssh_dir"' EXIT
(umask 077 && printf '%s\n' "$DEPLOY_SSH_KEY" > "$ssh_dir/key")
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$ssh_dir/known_hosts"

# shellcheck disable=SC2034
SSH_OPTS=(
  -i "$ssh_dir/key"
  -o IdentitiesOnly=yes
  -o BatchMode=yes
  -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile="$ssh_dir/known_hosts"
)
# shellcheck disable=SC2034
SSH_TARGET="$DEPLOY_USER@$DEPLOY_HOST"

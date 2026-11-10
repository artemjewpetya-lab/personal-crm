#!/usr/bin/env bash
# Deploys one version of the app on the server (docker compose project "prod").
#
#   deploy.sh <tag> [registry user]     tag = commit SHA of an image in GHCR
#
# Steps: back up the database -> get the image -> apply migrations in a one-off
# container -> start the new version -> smoke test /health -> keep only the
# current and previous images.
# The backup goes to backups/deploy_<UTC time>_<version that ran before>.dump;
# the newest 30 are kept. restore.sh loads one back.
# Failed backup or migrations: the new version is not started, the old one keeps running.
# Failed smoke test: the script exits with an error and rolls nothing back.
#
# CI (deploy/ci-deploy.sh) sends a short-lived GHCR token on stdin for the pull.
# Manual rollback: run this script with the previous tag; its image is kept on
# the server, so no token is needed:
#   sudo -u deploy bash /opt/personal-crm/deploy.sh "$(sudo cat /opt/personal-crm/state/previous_tag)"
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

readonly IMAGE_REPO="ghcr.io/artemjewpetya-lab/personal-crm"
readonly KEEP_DEPLOY_BACKUPS=30

tag="${1:-}"
registry_user="${2:-github-actions}"
if [[ ! "$tag" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Usage: deploy.sh <image tag (commit SHA)> [registry user]" >&2
  exit 2
fi
image="$IMAGE_REPO:$tag"
export APP_TAG="$tag"

cd "$APP_DIR"
check_user
check_env_file

if ! take_lock -w 300; then
  echo "Waited 5 minutes, it is probably a database restore. When it is done, run" >&2
  echo "the deploy again: GitHub -> Actions -> Deploy -> Re-run jobs." >&2
  exit 1
fi

# The GHCR token from CI comes on stdin: read it before anything else can.
token=""
if [[ ! -t 0 ]]; then
  read -r -t 10 token || true
fi

mkdir -p "$STATE_DIR"
current_tag="$(cat "$STATE_DIR/current_tag" 2>/dev/null || true)"

# 1. Backup of the database as it is before this deploy
log "Starting the database"
compose up -d --wait db

backup="$(new_backup_path deploy "${current_tag:-none}")"
log "Backing up the database to $backup"
if ! backup_db "$backup"; then
  echo "BACKUP FAILED: the new version was not started." >&2
  echo "The running version (${current_tag:-none}) was left as is." >&2
  exit 1
fi
log "Backup done: $(du -h "$backup" | cut -f1)"
prune_backups deploy "$KEEP_DEPLOY_BACKUPS"

# 2. Image
if docker image inspect "$image" >/dev/null 2>&1; then
  log "Image $image is already on the server"
else
  log "Pulling $image"
  if [[ -n "$token" ]]; then
    # Log in for this pull only, in a throwaway config: no token stays on disk.
    docker_config="$(mktemp -d)"
    trap 'rm -rf "$docker_config"' EXIT
    printf '%s' "$token" | DOCKER_CONFIG="$docker_config" \
      docker login ghcr.io -u "$registry_user" --password-stdin >/dev/null
    DOCKER_CONFIG="$docker_config" docker pull --quiet "$image"
  else
    docker pull --quiet "$image"
  fi
fi

# 3. Migrations, in a one-off container from the new image
log "Applying migrations"
if ! compose run --rm --no-deps -T migrate; then
  echo "MIGRATIONS FAILED: the new version was not started." >&2
  echo "The running version (${current_tag:-none}) was left as is." >&2
  echo "Database backup from before the migrations: $backup" >&2
  exit 1
fi

# 4. New version
log "Starting the app $tag"
compose up -d --no-deps app

# 5. Smoke test: /health must answer 200 from the new version
if ! smoke_test "$tag"; then
  echo "Nothing was rolled back. To roll back by hand, run on the server:" >&2
  echo "  sudo -u deploy bash $APP_DIR/deploy.sh ${current_tag:-<previous tag>}" >&2
  echo "Database backup from before this deploy: $backup" >&2
  exit 1
fi

# 6. Remember the versions: a manual rollback goes to the previous one.
if [[ -n "$current_tag" && "$current_tag" != "$tag" ]]; then
  echo "$current_tag" > "$STATE_DIR/previous_tag"
fi
echo "$tag" > "$STATE_DIR/current_tag"
previous_tag="$(cat "$STATE_DIR/previous_tag" 2>/dev/null || true)"

# 7. Keep only the current and previous app images, so the disk does not fill up.
for old in $(docker image ls "$IMAGE_REPO" --format '{{.Tag}}'); do
  if [[ "$old" != "$tag" && "$old" != "$previous_tag" ]]; then
    log "Removing old image $IMAGE_REPO:$old"
    docker image rm "$IMAGE_REPO:$old" >/dev/null \
      || echo "Warning: could not remove $IMAGE_REPO:$old" >&2
  fi
done

log "Deployed $tag (previous: ${previous_tag:-none})"

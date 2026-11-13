#!/usr/bin/env bash
# Deploys one version of the app to one environment on the server: prod or
# staging (the test stand). Both use this script and compose.yaml.
#
#   deploy.sh <prod|staging> <tag> [registry user]     tag = commit SHA of an image in GHCR
#
# Steps: (prod only) back up the database -> get the image -> apply migrations in a
# one-off container -> start the new version -> smoke test /health -> (prod only)
# remove old images.
# The prod backup goes to backups/deploy_<UTC time>_<version that ran before>.dump;
# the newest 30 are kept. restore.sh loads one back. The test stand has no backups:
# its database is a copy of prod, made again from a prod backup by copy-prod-db.sh.
# Failed backup or migrations: the new version is not started, the old one keeps running.
# Failed smoke test: the script exits with an error and rolls nothing back.
#
# CI (deploy/ci-deploy.sh) sends a short-lived GHCR token on stdin for the pull.
# Manual rollback of prod: run this script with the previous tag; its image is kept
# on the server, so no token is needed:
#   sudo -u deploy bash /opt/personal-crm/deploy.sh prod "$(sudo cat /opt/personal-crm/state/previous_tag)"
set -euo pipefail

# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

readonly KEEP_DEPLOY_BACKUPS=30

usage() {
  echo "Usage: deploy.sh <prod|staging> <image tag (commit SHA)> [registry user]" >&2
  exit 2
}

[[ $# -ge 2 ]] || usage
use_env "$1" || usage
tag="$2"
registry_user="${3:-github-actions}"
[[ "$tag" =~ ^[0-9a-f]{7,40}$ ]] || usage
image="$IMAGE_REPO:$tag"
export APP_TAG="$tag"

cd "$APP_DIR"
check_user
check_env_file

if ! take_lock -w 300; then
  echo "Waited 5 minutes for another deploy, a database restore or a copy of the" >&2
  echo "prod database. When it is done, run the deploy again:" >&2
  echo "GitHub -> Actions -> Deploy -> Re-run failed jobs." >&2
  exit 1
fi

# The GHCR token from CI comes on stdin: read it before anything else can.
token=""
if [[ ! -t 0 ]]; then
  read -r -t 10 token || true
fi

current_tag="$(current_tag_of "$ENV_NAME")"
log "Deploying $tag to $ENV_NAME (running now: ${current_tag:-none})"

log "Starting the database"
compose up -d --wait db

# 1. Prod only: backup of the database as it is before this deploy
backup=""
if [[ "$ENV_NAME" == prod ]]; then
  backup="$(new_backup_path deploy "${current_tag:-none}")"
  log "Backing up the database to $backup"
  if ! backup_db "$backup"; then
    echo "BACKUP FAILED: the new version was not started." >&2
    echo "The running version (${current_tag:-none}) was left as is." >&2
    exit 1
  fi
  log "Backup done: $(du -h "$backup" | cut -f1)"
  prune_backups deploy "$KEEP_DEPLOY_BACKUPS"
else
  log "No backup in $ENV_NAME: its database is a copy of prod"
fi

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
  if [[ -n "$backup" ]]; then
    echo "Database backup from before the migrations: $backup" >&2
  fi
  exit 1
fi

# 4. New version
log "Starting the app $tag"
compose up -d --no-deps app

# 5. Smoke test: /health must answer 200 from the new version
if ! smoke_test "$tag"; then
  echo "Nothing was rolled back. To roll back by hand, run on the server:" >&2
  echo "  sudo -u deploy bash $APP_DIR/deploy.sh $ENV_NAME ${current_tag:-<previous tag>}" >&2
  if [[ -n "$backup" ]]; then
    echo "Database backup from before this deploy: $backup" >&2
  fi
  exit 1
fi

# 6. Remember the versions: a manual rollback goes to the previous one.
if [[ -n "$current_tag" && "$current_tag" != "$tag" ]]; then
  echo "$current_tag" > "$STATE_DIR/previous_tag"
fi
echo "$tag" > "$STATE_DIR/current_tag"
previous_tag="$(cat "$STATE_DIR/previous_tag" 2>/dev/null || true)"

# 7. After a prod deploy, remove the old app images, so the disk does not fill up.
# Kept: the current and previous prod versions (for a rollback) and the version of
# the test stand. If the other environment is pulling a new image right now and it
# is removed, its compose pulls it again: the images in GHCR are public.
if [[ "$ENV_NAME" == prod ]]; then
  staging_tag="$(current_tag_of staging)"
  for old in $(docker image ls "$IMAGE_REPO" --format '{{.Tag}}'); do
    if [[ "$old" != "$tag" && "$old" != "$previous_tag" && "$old" != "$staging_tag" ]]; then
      log "Removing old image $IMAGE_REPO:$old"
      docker image rm "$IMAGE_REPO:$old" >/dev/null \
        || echo "Warning: could not remove $IMAGE_REPO:$old" >&2
    fi
  done
fi

log "Deployed $tag to $ENV_NAME (previous: ${previous_tag:-none})"

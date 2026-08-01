#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "Usage: gg-deploy /srv/project-directory [branch]" >&2
  exit 64
}

project_directory="${1:-}"
[[ -n "$project_directory" ]] || usage

case "$project_directory" in
  /srv/*) ;;
  *)
    echo "Deployment directories must be inside /srv." >&2
    exit 64
    ;;
esac

[[ -d "$project_directory/.git" ]] || {
  echo "No Git checkout at $project_directory." >&2
  exit 66
}

checkout_owner="$(stat -c '%U' "$project_directory")"
manifest_branch=""
manifest_compose_file=""
manifest_environment_file=""
manifest_file="$project_directory/gg-deploy.env"

if [[ -f "$manifest_file" ]]; then
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    [[ "$value" =~ ^[A-Za-z0-9._/-]+$ ]] || {
      echo "Invalid value in $manifest_file." >&2
      exit 65
    }
    case "$key" in
      BRANCH) manifest_branch="$value" ;;
      COMPOSE_FILE) manifest_compose_file="$value" ;;
      ENV_FILE) manifest_environment_file="$value" ;;
      *)
        echo "Unknown key '$key' in $manifest_file." >&2
        exit 65
        ;;
    esac
  done < "$manifest_file"
fi

branch="${2:-$manifest_branch}"
[[ -n "$branch" ]] || branch="$(sudo -H -u "$checkout_owner" git -C "$project_directory" branch --show-current)"
[[ -n "$branch" ]] || {
  echo "The checkout has no current branch; pass the branch explicitly." >&2
  exit 65
}

sudo -H -u "$checkout_owner" git -C "$project_directory" fetch origin "$branch"
sudo -H -u "$checkout_owner" git -C "$project_directory" merge --ff-only "origin/$branch"

if [[ -n "$manifest_compose_file" ]]; then
  compose_file="$manifest_compose_file"
  environment_file="$manifest_environment_file"
elif [[ -f "$project_directory/docker-compose.production.yml" ]]; then
  compose_file="docker-compose.production.yml"
  environment_file=".env.production"
elif [[ -f "$project_directory/docker-compose.yml" ]]; then
  compose_file="docker-compose.yml"
  environment_file=".env"
else
  echo "No supported Docker Compose file in $project_directory." >&2
  exit 66
fi

[[ -f "$project_directory/$compose_file" ]] || {
  echo "Compose file '$compose_file' does not exist in $project_directory." >&2
  exit 66
}

cd "$project_directory"
if [[ -f "$environment_file" ]]; then
  docker compose --env-file "$environment_file" -f "$compose_file" up -d --build
  docker compose --env-file "$environment_file" -f "$compose_file" ps
else
  docker compose -f "$compose_file" up -d --build
  docker compose -f "$compose_file" ps
fi

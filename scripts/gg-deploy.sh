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
branch="${2:-$(sudo -H -u "$checkout_owner" git -C "$project_directory" branch --show-current)}"
[[ -n "$branch" ]] || {
  echo "The checkout has no current branch; pass the branch explicitly." >&2
  exit 65
}

sudo -H -u "$checkout_owner" git -C "$project_directory" fetch origin "$branch"
sudo -H -u "$checkout_owner" git -C "$project_directory" merge --ff-only "origin/$branch"

if [[ -f "$project_directory/docker-compose.production.yml" ]]; then
  compose_file="docker-compose.production.yml"
  environment_file=".env.production"
elif [[ -f "$project_directory/docker-compose.yml" ]]; then
  compose_file="docker-compose.yml"
  environment_file=".env"
else
  echo "No supported Docker Compose file in $project_directory." >&2
  exit 66
fi

cd "$project_directory"
if [[ -f "$environment_file" ]]; then
  docker compose --env-file "$environment_file" -f "$compose_file" up -d --build
  docker compose --env-file "$environment_file" -f "$compose_file" ps
else
  docker compose -f "$compose_file" up -d --build
  docker compose -f "$compose_file" ps
fi

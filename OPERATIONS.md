# Production operations

## Service

- Public site: https://politik-kompass-schweiz.info
- Hosting: Hetzner server `general`
- Database: existing managed Supabase Postgres project
- Deployment: reviewed Git revision built with `docker-compose.production.yml`
- Public gateway: the shared Caddy service from the private `production-operations` repository

## Secrets

The runtime database connection is stored only in
`/etc/production-secrets/politik-kompass.env` on the server. Database migration
credentials use a separate file and are not available to the running website.
Neither file belongs in Git.

Production connections verify both the Supabase certificate authority and the
pooler hostname. The public Supabase 2021 production CA is bundled in the
container; the database password remains only in the protected environment
file.

## Health check

`/api/catalog/map?metric=population_total` must return HTTP 200 with data.
After every release, also open the public homepage and one map view.

## Backup

Supabase is backed up with a logical Postgres dump. Verify its SHA-256 checksum
and copy it to the encrypted off-server backup location before server work. The
website server itself is replaceable; the managed Supabase project is not
recreated during a normal deployment.

## Rollback

Keep the previous reviewed Git commit and container image tag. If a release
fails, redeploy that exact revision and recheck the health endpoint. Do not
restore the compromised 2026-08-12 server snapshot as a production system; it
is forensic emergency evidence only.

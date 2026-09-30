# Production operations

## Service

- Public site: https://politik-kompass-schweiz.info
- Hosting: Hetzner server `general`
- Database: existing managed Supabase Postgres project
- Deployment: reviewed Git revision built with `docker-compose.production.yml`
- Public gateway: the shared Caddy service from the private `production-operations` repository

The application container is limited to 1 GiB RAM, one CPU and 256 processes.
It runs as an unprivileged user with a read-only filesystem and dropped capabilities.

## Secrets

The runtime database connection is stored only in
`/etc/production-secrets/politik-kompass.env` on the server. Database migration
credentials use a separate file and are not available to the running website.
Neither file belongs in Git.

Production connections verify both the Supabase certificate authority and the
pooler hostname. The public Supabase 2021 production CA is bundled in the
container; the database password remains only in the protected environment
file.

## Google Tag Manager dependency

The global root layout includes Google's supplied head bootstrap and body noscript fallback for public container `GTM-M9C9LKDH`. The browser loads `https://www.googletagmanager.com/gtm.js?id=GTM-M9C9LKDH`; the JavaScript-disabled fallback uses `https://www.googletagmanager.com/ns.html?id=GTM-M9C9LKDH`. No server secret or environment setting is needed. Tags published in Google's container are managed outside application releases; this release does not create GA4 tags, measurement IDs, custom events, consent configuration or the earlier local visitor-statistics draft.

Verify exactly one bootstrap in the delivered head, the noscript fallback at the start of the body, one container request per document and no second bootstrap on client navigation. Also verify the actual public Google script response; an unpublished/missing container can return 404 even when the site's snippet is correct. Container/account changes belong in Google's protected settings. Before later analytics/advertising tags, review privacy disclosures and applicable consent requirements. Rollback to the previous app image removes these snippets; no database restore is required.

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

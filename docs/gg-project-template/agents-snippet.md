# Deployment

Read `docs/gg-deployment.md` before touching anything deployment-related, or if this
project has no copy of it, read
https://github.com/Merkelmore/demografie-schweiz/blob/master/docs/gg-deployment.md

It covers the shared `gg-deploy` command, the three prerequisites every project must
provide (domain, production environment, production directory), and what a new
project does and does not inherit. Do not re-derive any of it from the
orchestrator's own source.

Pushing to `master` deploys to production. Two things bite agents here:

- **Check your GitHub credential before you start, not at push time.**
  `GET https://api.github.com/user` with `GG_GITHUB_TOKEN`. It is often expired,
  there is no `ssh` binary in the container, and finding out after the work is done
  wastes a round-trip. Anonymous HTTPS `fetch` still works for reading.
- **A production working copy may carry local recovery edits** — a hand-patched
  `Caddyfile` is the usual one. Never `git add -A`; stage explicit paths.

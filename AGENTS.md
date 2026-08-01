<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deployment

Read [`docs/gg-deployment.md`](docs/gg-deployment.md) before touching anything
deployment-related. It covers the shared `gg-deploy` command, the three
prerequisites a project must provide, and what a new project does and does not
inherit. Do not re-derive any of it from the orchestrator's own source.

Pushing to `master` deploys to production. Two things bite agents here:

- **Check your GitHub credential before you start, not at push time.**
  `GET https://api.github.com/user` with `GG_GITHUB_TOKEN`. It is often expired,
  there is no `ssh` binary in the container, and finding out after the work is
  done wastes a round-trip. Anonymous HTTPS `fetch` still works for reading.
- **The `Caddyfile` in a working copy may carry local recovery edits.** Never
  `git add -A`; stage explicit paths. `next build` also rewrites `tsconfig.json`
  as a side effect — revert that rather than committing it.

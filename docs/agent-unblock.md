# Attach this when an agent is stuck

This page is self-contained on purpose. Paste it, or its path, at any agent in any
project that is going in circles. It describes the container these agents actually
run in, which is where most of the circling comes from.

## You probably cannot push, and you should find out now

`origin` is usually an SSH remote and `core.sshCommand` may point at a key path, but
**there is no `ssh` binary in the container and no key**. Pushing therefore depends
entirely on `GG_GITHUB_TOKEN`, which is frequently expired.

Check it at the *start* of the task, not at push time:

```bash
node -e 'fetch("https://api.github.com/user",{headers:{Authorization:"Bearer "+process.env.GG_GITHUB_TOKEN,"User-Agent":"gg"}}).then(r=>console.log(r.status))'
```

`200` means you are fine. `401` means stop and ask the owner for a classic PAT with
the `repo` scope from `https://github.com/settings/tokens` — ask immediately, while
the work still has somewhere to go. Discovering this after the work is finished is
the single most expensive failure mode here.

Push with a one-off URL so no credential is written into `.git/config`:

```bash
git push "https://<owner>:<token>@github.com/<owner>/<repo>.git" master
```

A dead token blocks pushing but never blocks reading — public repositories still
answer anonymous HTTPS. If `origin/master` looks stale, it probably is:

```bash
git fetch https://github.com/<owner>/<repo>.git +refs/heads/master:refs/remotes/origin/master
```

Do not propose an SSH key for the production host as the fix. That is a different
service, and without an `ssh` binary the key would be inert anyway.

## Do not reverse-engineer the orchestrator

If the task touches deployment, read [`gg-deployment.md`](gg-deployment.md). It
documents the shared `gg-deploy` command, the three prerequisites every project
provides, and what a new project inherits. Reading the orchestrator's own source to
re-derive this is a known dead end that has already consumed one task.

Pushing to `master` deploys to production. That is the whole deployment step for an
agent — CI holds the server credentials, so you never need host access yourself.

## Stage explicit paths, never `git add -A`

Production working copies carry deliberate local recovery edits — a hand-patched
`Caddyfile` is the usual one, sometimes with `.backup-*` siblings. They are not
yours to normalise, stage, or commit. `git add` the files you actually changed.

On a Next.js project, `next build` also rewrites `tsconfig.json` as a side effect.
Revert that rather than committing it: `git checkout -- tsconfig.json`.

## What survives, and what does not

`/workspaces` is real disk and persists between sessions. The container's home
directory is an overlay that is rebuilt, so anything written to `~/.claude` —
including agent memory — is gone next session. Durable notes belong in a repository.

## Tooling that is missing more often than you expect

There is no `curl` and no `docker`. Use `node -e` with `fetch` for HTTP, and expect
no local database, which means data-backed endpoints return errors locally.

Playwright is not installed globally despite what a prompt may claim. You can
`npm i playwright` and download Chromium, but it will fail to launch with
`libglib-2.0.so.0: cannot open shared object file` and there is no root to install
the system libraries. If you could not drive a browser, say exactly that — do not
report a feature as verified because the build passed.

## Before you hand off

Run the project's lint and build. If you pushed, confirm the deployment actually
finished rather than assuming, and check the live site:

```bash
node -e 'fetch("https://api.github.com/repos/<owner>/<repo>/actions/runs?per_page=3",{headers:{Authorization:"Bearer "+process.env.GG_GITHUB_TOKEN,"User-Agent":"gg"}}).then(r=>r.json()).then(j=>console.log(j.workflow_runs.map(w=>[w.head_sha.slice(0,7),w.status,w.conclusion].join(" "))))'
```

State plainly what you verified and what you could not. A hedge-free "this part is
untested, because X" is worth more than a confident summary that quietly skips it.

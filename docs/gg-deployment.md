# GG deployment flow

This is the reusable deployment flow for GG-managed projects on the shared Hetzner
host. It is written to be project-agnostic: Cultural Enrichment Radar
(`/srv/cultural-enrichment-radar`, this repository) is the reference
implementation, and a new project follows the same three steps.

## What a new project needs

Every GG project needs exactly three things before it can deploy. Nothing else in
this document works until all three exist.

| Requirement | What it is | Where it is declared |
| --- | --- | --- |
| **Domain** | A hostname with an `A` record pointing at the shared host's public IPv4 address | DNS provider, then `DOMAIN` in the project's environment file |
| **Production environment** | A `chmod 600` environment file on the host holding runtime secrets and `DOMAIN` | `<production directory>/.env.production`, never committed |
| **Production directory** | A Git checkout below `/srv`, owned by the deployment account | `/srv/<project-directory>` on the host |

The three are independent of GG itself. GG does not create them; it drives
deployments once they exist.

## What a new project inherits, and what it does not

Almost nothing carries over on its own. Only the first row below is genuinely
shared; everything else is per-project setup that someone has to perform once.

| Thing | Inherited by a new project? | Why |
| --- | --- | --- |
| `/usr/local/bin/gg-deploy` | **Yes** | It lives on the shared host. Every project's workflow reinstalls the newest copy from its own `scripts/gg-deploy.sh` before invoking it, so all projects run the same command. |
| This document | **No** | It lives in one repository. See *Making this reach every agent* below. |
| `DEPLOY_USER` / `DEPLOY_PASSWORD` / `DEPLOY_SSH_KEY` | **No** | GitHub Actions secrets are per-repository. The account is a personal User with no organisations, so organisation-level shared secrets are not available — each new repository needs its own copies. |
| A GitHub token for agents | **No** | Agent containers receive `GG_GITHUB_TOKEN` from GG, not from the repository. If it is missing or expired the agent cannot push, and this fails at the very end of a task. Verify it early with `GET https://api.github.com/user`. |
| Deployment workflow and `gg-deploy.env` | **No** | Both are files in the repository. Copy them from [`gg-project-template/`](gg-project-template/). |
| Domain, `.env.production`, `/srv` checkout | **No** | The three prerequisites above, by definition. |

Note for agents: the container's home directory is an overlay that is rebuilt
between sessions, while `/workspaces` is persistent disk. Anything written to
`~/.claude` is gone next session. Durable knowledge belongs in a repository or in
GG's own instructions.

## Keep `GG_GITHUB_TOKEN` alive

This is the single highest-value maintenance item, and the one that has actually
cost time. Agents finish a task, try to push, and only then discover the token is
dead — the work is complete but stranded, and recovering it costs a round-trip
through whoever owns the account.

Set a working token in **GG's own environment** as `GG_GITHUB_TOKEN`, so every
agent container inherits it. It is not a repository secret and cannot be set
per-project. A classic PAT with the `repo` scope is sufficient; generate it at
`https://github.com/settings/tokens`.

Because the token expires, treat it as something to renew rather than to set once.
Two habits make an expiry cheap instead of expensive:

- Agents verify the credential at the *start* of a task, not at push time:
  `GET https://api.github.com/user`. A `401` means ask for a fresh token
  immediately, while the work still has somewhere to go.
- Anonymous HTTPS still reads a public repository, so a dead token blocks pushing
  but never blocks fetching. A stale `origin/master` can always be refreshed with
  `git fetch https://github.com/<owner>/<repo>.git +refs/heads/master:refs/remotes/origin/master`.

Never store the token in a file in this repository — it is public. Push with a
one-off URL so no credential is written into `.git/config`.

## Making this reach every agent

A document in one repository only helps the project that holds it. There are two
levers, and it is worth knowing which file does what.

**Per project — works today, no orchestrator change.** Agents working on a project
read that project's `AGENTS.md`. The orchestrator keeps each checkout in
`workspaces/<project>/` on the host and mounts it into the container, so the
project's own file is what reaches them. Append
[`gg-project-template/agents-snippet.md`](gg-project-template/agents-snippet.md)
to a new project's `AGENTS.md`, outside any `<!-- BEGIN:… -->` / `<!-- END:… -->`
block, since content inside those markers is regenerated.

Note that the orchestrator's own `/srv/garden-gnome-orchestrator/AGENTS.md` is *not*
the right place: it documents the orchestrator's codebase and is read by agents
working on the orchestrator itself, not by project agents.

**All projects at once — needs an orchestrator change.** Claude Code reads
`~/.claude/CLAUDE.md` as global instructions for every project, but the container's
home directory is a fresh overlay each session, so the file has to be created at
container start to be there at all. Seeding it from the agent image or entrypoint is
the only way to make one document apply everywhere without touching each repository.

## Shared host setup (once per host, already done)

The host installs one shared command at `/usr/local/bin/gg-deploy`
(source: [`scripts/gg-deploy.sh`](../scripts/gg-deploy.sh)). Every project's
deployment workflow pipes the script over SSH and installs it before invoking it,
so the newest version of the command always runs and there is nothing to keep in
sync by hand.

`gg-deploy` deliberately constrains what a deployment may do:

- It refuses any project directory outside `/srv`.
- It refuses a directory that is not a Git checkout.
- It runs every Git operation as the checkout's owning user (`stat -c '%U'`), not
  as root, so file ownership inside the checkout stays consistent.
- It updates with `git fetch` plus `git merge --ff-only`. It never runs
  `git reset --hard` and never discards uncommitted local files.

That last point matters: production checkouts routinely carry local recovery
edits (for example a hand-patched `Caddyfile` that routes an additional host).
A fast-forward-only update leaves those edits in place, and a deployment fails
loudly instead of silently overwriting them if history has diverged.

## Registering a new project

### 1. Create the production directory

Clone the repository below `/srv` as the deployment account:

```bash
sudo -H -u DEPLOY_USER git clone REPOSITORY_URL /srv/<project-directory>
```

The directory name is the project's identity for deployment purposes. It does not
have to match the repository name — this repository is `demografie-schweiz` but
deploys to `/srv/cultural-enrichment-radar`, matching the product name and the
Docker image name.

### 2. Create the production environment

```bash
cd /srv/<project-directory>
cp .env.example .env.production
chmod 600 .env.production
```

Fill in the runtime secrets and set `DOMAIN` to the final public hostname. Secrets
belong only in this file or in a local terminal — never in a ticket, chat message,
commit, or screenshot.

### 3. Add the deployment manifest

Commit a `gg-deploy.env` at the repository root:

```dotenv
BRANCH=master
COMPOSE_FILE=docker-compose.production.yml
ENV_FILE=.env.production
```

`gg-deploy` parses only these three keys and rejects both unknown keys and values
outside `[A-Za-z0-9._/-]`, so the manifest cannot smuggle shell into a deployment.
Without a manifest the command falls back to `docker-compose.production.yml` +
`.env.production`, then `docker-compose.yml` + `.env`; the manifest is preferred
because it makes the contract explicit.

### 4. Point DNS at the host, then start the stack

Create the `A` record **before** the first start. Caddy can only obtain a
certificate once the hostname resolves publicly to the host and ports `80`/`443`
are reachable.

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

### 5. Wire the deployment workflow

Add a workflow that installs the shared command and invokes it. Configure
`DEPLOY_USER` plus either `DEPLOY_SSH_KEY` (preferred) or `DEPLOY_PASSWORD` as
repository secrets, and use a `concurrency` group so two pushes cannot rebuild the
same directory at once:

```yaml
- run: cat scripts/gg-deploy.sh | "${SSH[@]}" "install -m 755 /dev/stdin /usr/local/bin/gg-deploy"
- run: "${SSH[@]}" "gg-deploy /srv/<project-directory> master"
```

See [`.github/workflows/deploy-production.yml`](../.github/workflows/deploy-production.yml)
for the full reference workflow, including SSH key and password fallback.

## Domain routing stays with the project

`gg-deploy` does not touch Caddy configuration. Each project owns its own
`Caddyfile` and publishes its own hostname through `DOMAIN`. Adding a second
hostname to a host — for example routing an admin domain to a different container
— is an edit to that project's `Caddyfile`, made deliberately and reviewed like any
other change.

Consequence for agents working in a production checkout: a locally modified
`Caddyfile` is expected, and is not yours to normalise, stage, or commit unless
the task is explicitly about routing.

## Verifying a deployment

```bash
docker compose --env-file .env.production -f docker-compose.production.yml ps
curl -I https://<domain>
```

The migration container must exit `0`, the app container must report healthy, and
Caddy starts only after that health check passes. Inspect failures with
`docker compose ... logs --tail=100`, which does not print the environment file.

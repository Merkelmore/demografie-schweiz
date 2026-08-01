# New-project deployment starter

Copy these two files into a new GG project to give it the same deployment flow this
repository uses. Neither file is active here: workflows only run from
`.github/workflows/`, so the copy below is inert documentation.

```bash
cp docs/gg-project-template/gg-deploy.env         <new-project>/gg-deploy.env
cp docs/gg-project-template/deploy-production.yml <new-project>/.github/workflows/
```

Then, in the new project:

1. Replace `PROJECT_DIRECTORY` in the workflow with the project's directory name
   under `/srv`, and check `COMPOSE_FILE` / `ENV_FILE` in the manifest.
2. Add the repository secrets `DEPLOY_USER` plus either `DEPLOY_SSH_KEY`
   (preferred) or `DEPLOY_PASSWORD`. These are per-repository and are **not**
   inherited from any other project.
3. Copy `scripts/gg-deploy.sh` from this repository as well — the workflow installs
   the host command from its own copy, which is what keeps every project on the
   same version.
4. Complete the three prerequisites in [`../gg-deployment.md`](../gg-deployment.md):
   domain, production environment, production directory.
5. Append [`agents-snippet.md`](agents-snippet.md) to the new project's `AGENTS.md`.
   This is the step that stops the next agent rediscovering all of the above.

## Why the pointer goes in the project, not in the orchestrator

The orchestrator's own `AGENTS.md` describes the orchestrator's codebase and is read
by agents working *on* it. Agents working on a project read that project's
`AGENTS.md`, which the orchestrator keeps alongside the checkout in
`workspaces/<project>/` and mounts into the container. So a deployment pointer only
reaches project agents if it is in the project's own file — which also means it is
version-controlled and travels with the repository.

Keep the snippet outside any `<!-- BEGIN:… -->` / `<!-- END:… -->` block, since
content inside those markers is regenerated.

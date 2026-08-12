<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Production

- Production is managed from the private `Merkelmore/production-operations` repository.
- Pushing or merging code does not deploy production. Releases are explicit and use a selected, reviewed Git revision.
- Do not add GitHub Actions that SSH to production or copy credentials to a runner.
- The central production gateway owns public ports and HTTPS; this repository exposes only the internal application port.
- Keep the existing Supabase project and data. Runtime access and migration access use separate protected settings.
- Never commit `.env` files, database URLs, passwords, API keys, SSH keys, or production backup contents.
- Before a release, run lint, the political-compass test, a production build, the container health check, and the public API smoke test.

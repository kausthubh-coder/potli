# Production operations

Production commands need the developer's explicit go. Agents use the `ship-potli` skill.

- Cloudflare account: kausthubh2007@gmail.com's account (`dbc4f7e1319d359db1dde21b6d9a05aa`).
- Worker: `potli`. D1: `potli` (`1d804341-1c2a-42e4-9738-a4b6f638125b`). R2: `potli-tarballs`.
- Apply migrations to production D1, before deploying code that needs them:
  `bunx wrangler d1 migrations apply DB --remote`
- Deploy: `bun run build && bunx wrangler deploy`
- Secrets (once, and on rotation): `bunx wrangler secret put <NAME>` for `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `POSTHOG_KEY`.
- Logs: Workers Logs in the Cloudflare dashboard, or `bunx wrangler tail`.

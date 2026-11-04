# Production operations

Production commands need the developer's explicit go. Agents use the `ship-potli` skill.

- Cloudflare account: kausthubh2007@gmail.com's account (`dbc4f7e1319d359db1dde21b6d9a05aa`).
- Worker: `potli`. D1: `potli` (`1d804341-1c2a-42e4-9738-a4b6f638125b`). R2: `potli-tarballs`.
- Apply migrations to production D1, before deploying code that needs them:
  `bunx wrangler d1 migrations apply DB --remote`
- Deploy: `bun run build && bunx wrangler deploy`
- Secrets (once, and on rotation): `bunx wrangler secret put <NAME>` for `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `POSTHOG_KEY`, `SIGNUP_ALLOWLIST`
  (comma-separated GitHub logins that may create an account, or `*` for anyone; production is `*`), `ADMIN_LOGINS`
  (comma-separated GitHub logins that can open `/admin` to see reports and take packages down;
  empty or `*` means nobody). Never set `DEV_LOGIN` in
  production; it's local-only, and `vite build` strips the dev sign-in it enables anyway.
- Reports and takedowns: sign in as an `ADMIN_LOGINS` login and open `/admin` (also linked from
  /settings). A takedown can't be undone from the website. To undo one, with the developer's go:
  `bunx wrangler d1 execute DB --remote --command "UPDATE versions SET taken_down_at = NULL, taken_down_by = NULL WHERE package_name = '@scope/name' AND version = '1.0.1'"`
  (or `UPDATE packages ...` for a whole package), then put back any dist-tag with `npm dist-tag add`.
  Taken-down tarballs stay in R2; delete one by hand only when the law requires it.
- Rate limits: counters live in the D1 table `rate_limits` (limits in `src/lib/rate-limit.ts`). To
  lift one early: `DELETE FROM rate_limits WHERE key LIKE 'publish:user:<user id>'`.
- Logs: Workers Logs in the Cloudflare dashboard, or `bunx wrangler tail`.

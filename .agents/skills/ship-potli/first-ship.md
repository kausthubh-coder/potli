# First ship of potli

Read this when `git -C <main> remote get-url origin` fails or `ship-potli` still says `<subdomain>`. Everything here happens once.

## Only I can do these

Tell me which are missing and wait. Check each read-only first:

1. **The GitHub repo.** `gh repo view kausthubh-coder/potli` fails until I create it. I create it public and empty, then push `main` from `<main>`:
   ```
   git -C <main> remote add origin https://github.com/kausthubh-coder/potli.git
   git -C <main> push -u origin main
   ```
   After that, `main` lands only through PRs (step 2 of `SKILL.md`). Ask me to turn on branch protection requiring the `check` job.
2. **Production secrets.** `bunx wrangler secret list` names what is set. Every name in `.dev.vars.example` needs a production value, set by me with `bunx wrangler secret put <NAME>`:
   - `BETTER_AUTH_SECRET`: a new random value, never the dev one.
   - `BETTER_AUTH_URL`: `<prod>`. My workers.dev subdomain is on the Workers overview page of the Cloudflare dashboard; ask me for it.
   - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`: a GitHub OAuth app whose callback URL is `<prod>/api/auth/callback/github`.
   - `POSTHOG_KEY`: may stay empty.
   `wrangler secret put` on a Worker that doesn't exist yet creates it, which is fine.

## What changes in the normal steps

- **Step 3:** production D1 has no migrations applied; `migrations list DB --remote` lists all of `drizzle/`. Apply them all.
- **Step 4:** the first `bunx wrangler deploy` prints the real URL, `https://potli.<subdomain>.workers.dev`. Check it matches `BETTER_AUTH_URL`, then replace `<subdomain>` in `SKILL.md` with it, and delete this file and the **First ship** paragraph that points here, in a follow-up PR.
- **Step 5:** `bunx wrangler deployments list` shows one version; there is no `<prev>`, so the rollback is `bunx wrangler delete` only on my go.

---
name: ship-potli
description: Take verified potli work through a PR to main and to production (D1 migrations, then the Worker deploy), then leave main, the main checkout and the worktree list clean. Use only when I say ship, deploy, release, or merge and deploy.
---

# Ship potli

potli ships from `main` on `kausthubh-coder/potli` (public) to one Cloudflare account (`docs/ops.md`):

| Surface | What ships it | When |
|---|---|---|
| `main` | a PR, CI green (`.github/workflows/ci.yml`: `bun run build`, then `bun run check`), squash merge | every change |
| production D1 `potli` | `bunx wrangler d1 migrations apply DB --remote` | the change added a file under `drizzle/`; always before the deploy |
| Worker `potli` (site and npm API) | `bun run build && bunx wrangler deploy`, from the merge commit | the change touched `src/`, `public/`, `drizzle/`, `wrangler.jsonc`, `vite.config.ts`, `package.json` or `bun.lock` |
| Worker secrets | `bunx wrangler secret put <NAME>`, run by me | the change added a name to `.dev.vars.example` |
| main checkout | `git pull --ff-only` | every ship |

Merging deploys nothing: no Cloudflare Git integration is connected, so the deploy is always your step. A change that touches only `docs/`, `.agents/`, `.github/`, `scripts/`, `test/` or Markdown lands and skips steps 3 and 4.

Production is `https://potli.<subdomain>.workers.dev` (`<prod>` below). `<main>` is `C:\Users\kaust\OneDrive\Documents\dev\potli`.

**First ship.** If `git -C <main> remote get-url origin` fails, or `<subdomain>` above is still a placeholder, read [first-ship.md](first-ship.md) first: it lists the one-time steps only I can do and what it changes below.

**Rules**
- Production needs my go in this conversation. "Ship" (or deploy, release, merge and deploy) is that go for every step below, including the remote migration, the deploy, the main checkout pull and cleanup: don't stop to ask between steps.
- Secrets need values only I have. When a step needs one, give me the exact `bunx wrangler secret put <NAME>` command and wait.
- When a step fails because of this change (a red CI job, a build or deploy error), fix it on the branch, rerun the checks and carry on. Stop and tell me only when the cause is outside the change or the fix needs my decision.
- Never end the turn while a CI run or deploy you started is queued or running. Watch it to the end.
- Never force-push, push to `main` directly, skip or disable a check, or pass `--remote` outside steps 3 and 5.
- A rehearsal ("dry run") walks every step and prints the push, PR, merge, migration and deploy commands instead of running them.

## 1. Ready

In the worktree:

```
git fetch origin
git status --short                          # prints nothing
git rev-list --count HEAD..origin/main      # 0; otherwise git merge origin/main, resolve, recheck
bun run build && bun run check              # what CI runs
bunx wrangler deploy --dry-run              # bundles the Worker and checks its bindings; uploads nothing
git log --oneline origin/main..HEAD         # what's going out
git diff --stat origin/main...HEAD          # which surfaces (table above)
git diff --name-only origin/main...HEAD -- drizzle .dev.vars.example
```

- Every changed feature was driven with `verify-potli` and has evidence in this thread: a real `npm publish` / `bun add` against your dev server for registry changes, the page itself for site changes. Missing evidence means not ready.
- A new migration must work under the Worker that is live now, because it runs before the deploy: add tables and nullable columns; drop or rename only in a later ship, after the code stops using them. If it can't be additive, stop and tell me.
- A new name in `.dev.vars.example`: check `bunx wrangler secret list` for it. Missing: give me the `secret put` command now and wait.
- Write down the rollback before step 2: `bunx wrangler deployments list` and note the version ID that is live now (`<prev>`).

## 2. Land

```
git push -u origin HEAD
gh pr create --base main --fill
gh pr checks <pr> --watch --fail-fast       # the CI "check" job; give up after 20 minutes
```

A red check caused by this change: fix it, rerun step 1's checks, push, watch again. When it's green, merge:

```
gh pr merge <pr> --squash
gh pr view <pr> --json mergeCommit -q .mergeCommit.oid      # <sha>
```

Leave out `--delete-branch`: gh would try to check out `main` here, which the main checkout holds. Step 7 deletes the branch.

## 3. Migrate production D1

Only when the change added a migration. From the merge commit, so the files match `main`:

```
git fetch origin
git checkout --detach origin/main            # HEAD = <sha>; frees the branch for step 7
bunx wrangler d1 migrations list DB --remote # lists exactly this change's new files
bunx wrangler d1 migrations apply DB --remote
```

## 4. Deploy the Worker

Only when the change touched what the Worker runs (table above). Still at `<sha>`:

```
git checkout --detach origin/main            # if step 3 didn't
bun install --frozen-lockfile
bun run build
bunx wrangler deploy                         # prints <prod> and "Current Version ID: <new>"
```

`wrangler deploy` finishes when it returns; there is nothing left to watch.

## 5. Check production

Reads only. Never publish to, sign in to, or write to production to check it.

```
curl -s -o /dev/null -w "%{http_code}\n" <prod>/      # 200
curl -s <prod>/-/ping                                 # {}
npm ping --registry <prod>/                           # PONG
bunx wrangler deployments list                        # <new> at 100%
bunx wrangler d1 migrations list DB --remote          # "No migrations to apply"
```

Then read what this change added: the new page, or `npm view <existing @scope/name> --registry <prod>/` for a registry change. Errors after the deploy: `bunx wrangler tail` for a minute while you load the page.

## 6. Update the main checkout

- If `git -C <main> status --short` prints nothing and `git -C <main> branch --show-current` is `main`: `git -C <main> pull --ff-only`, then `bun run setup` in `<main>`. The main checkout runs nothing live, so this is not a deploy.
- If it's dirty or on another branch: leave it and tell me.

## 7. Clean up

- `git push origin --delete <branch>`, then `git branch -D <branch>` (possible once step 3 or 4 detached this worktree from it; otherwise `git checkout --detach` first).
- This thread can't remove its own worktree: list it for removal (`worktree-potli`, "Remove a worktree"). Remove other finished worktrees only if no live thread uses them (`t3_thread_list`).

## 8. Report

A few lines: the PR and `<sha>`; what went live (migrations applied, Worker version `<new>` at `<prod>`); the evidence (CI run, verify-potli evidence, step 5 output); what was skipped and why, and anything waiting on me.

## Rollback

- **Worker:** `bunx wrangler rollback <prev>` puts the previous version back at once. Then fix forward: `git revert <sha>` on a new branch, PR, CI, merge, deploy.
- **D1:** migrations have no down step. An additive migration can stay under the old code. To undo data damage, `bunx wrangler d1 time-travel info potli` shows restore points, and `bunx wrangler d1 time-travel restore potli --timestamp=<before step 3>` rewinds the whole database, dropping every write since, including users' publishes. That needs my go by name, even during a ship.
- **Tarballs in R2:** a deploy never deletes them. Published versions never change, so nothing in R2 is rolled back.

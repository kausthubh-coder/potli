---
name: worktree-potli
description: Make a potli checkout ready to work in, with its own port, local D1 and local R2. Use at the start of every task in a new worktree, when deps, env, port or the database look wrong, and before giving a helper agent its own checkout.
---

# Worktree setup for potli

## Setup, doctor, dev

From the checkout root:

```
bun run setup    # deps, env files, port, local D1 migrations, skills link; then the doctor
bun run doctor   # read-only; every FAIL prints the command that fixes it
bun run dev      # http://localhost:<PORT in .env.local>; ready when Vite prints "Local:"
```

Setup takes about 70 s in a brand-new worktree (`bun install`, 338 packages) and about 1 s when nothing is missing. Rerun it whenever you like. The first `bun run dev` in a checkout takes about a minute before it prints `Local:` (Vite optimizes dependencies); later starts are quicker.

A healthy doctor exits 0:

```
ok   deps installed and current with bun.lock
ok   .dev.vars and .env.local exist
ok   BETTER_AUTH_SECRET set
ok   BETTER_AUTH_URL matches PORT 3739
ok   PORT 3739 is not claimed by another worktree
ok   dev env points at localhost, not production
warn GitHub OAuth keys missing in .dev.vars: sign-in won't work (registry and pages still do)
ok   local D1 has every migration
ok   .claude/skills links to .agents/skills
info port 3739 is free
info no origin/main to compare against
```

The GitHub warn is expected until I put OAuth keys in the main checkout's `.dev.vars`. "no origin/main" is expected until the GitHub remote exists; after that the doctor warns when you are behind.

## What each checkout has to itself

- **Port.** Setup hashes the checkout path to a port in 3100-3899 and skips ports other worktrees claimed (their `.env.local`, running or not) and anything listening on `127.0.0.1` or `::1`. The main checkout keeps 3000. The port goes to `PORT` in `.env.local` (`vite.config.ts` reads it with `strictPort`) and to `BETTER_AUTH_URL` in `.dev.vars`. Setup keeps a port once claimed. If Vite says the port is in use and it isn't your own dev server, delete the `PORT` line from `.env.local` and rerun setup.
- **Side ports.** Each dev server also opens a Workers inspector (9229 or the next free one) and a TanStack devtools bus (4206, or an OS-assigned port when taken). Both pick a free port themselves; there is nothing to claim.
- **Database and tarballs.** `bun run dev` and every `wrangler ... --local` command use `.wrangler/state` in the checkout: its own D1 and its own R2. A row written in one checkout is missing from every other one. `wrangler.jsonc` names the production D1 `potli` and bucket `potli-tarballs`, but only `--remote` reaches them; locally those names are labels.
  - Run SQL against your D1: `bunx wrangler d1 execute DB --local --command "SELECT ..."` from the checkout root.
  - Put a file in your R2: `bunx wrangler r2 object put potli-tarballs/<key> --local --file <file>`.
  - Start over with an empty database: stop dev, delete `.wrangler/state`, rerun setup.
- **Env.** Setup copies `.dev.vars` and `.env.local` from the main checkout when they are missing, then rewrites the port values. It refuses a `.dev.vars` that names production (`potli.`, `workers.dev`, `kausthubh.dev`). The PostHog keys are empty in dev, so nothing reaches analytics; if they ever get values, every checkout reports to the same PostHog project.

## Start and stop dev with a PID

Start dev so you hold the PID of the tree (PowerShell):

```
$dev = Start-Process -FilePath (Get-Command bun).Source -ArgumentList 'run','dev' -WorkingDirectory <checkout> -RedirectStandardOutput <checkout>\.wrangler\dev.log -RedirectStandardError <checkout>\.wrangler\dev.err.log -WindowStyle Hidden -PassThru
$dev.Id
```

Wait for `Local:` in `dev.log`. Stop it with `taskkill /T /F /PID <that id>`: the tree is bun, `vite.exe`, node and `workerd.exe`. Stop only processes you started. Other agents' dev servers run from their own worktrees.

## The main checkout

`C:\Users\kaust\OneDrive\Documents\dev\potli`, on `main`, port 3000. Never edit it. Only `ship-potli` touches it, with a fast-forward pull.

## Helpers

One worktree and one dev server per helper agent; never two agents in one checkout. Make it under the folder T3 uses:

```
git -C C:\Users\kaust\OneDrive\Documents\dev\potli fetch origin
git -C C:\Users\kaust\OneDrive\Documents\dev\potli worktree add C:\Users\kaust\.t3\worktrees\potli\<name> -b <branch> origin/main
cd C:\Users\kaust\.t3\worktrees\potli\<name>
bun run setup
```

Until the GitHub remote exists, skip the fetch and branch from `main`. Give the helper the path and the port setup printed.

## Remove a worktree

From a different checkout:

```
bun run remove-worktree C:\Users\kaust\.t3\worktrees\potli\<name>            # refuses uncommitted changes
bun run remove-worktree C:\Users\kaust\.t3\worktrees\potli\<name> --force    # drops them
```

It stops every process running from that checkout's `node_modules` (vite, workerd) with its children, removes the `.claude\skills` junction alone, then runs `git worktree remove`. It takes about a minute, almost all of it deleting `node_modules`. It keeps the branch: delete it with `git branch -D <branch>` once its PR is merged. It refuses the main checkout and the checkout you run it from.

Remove a worktree only when its work is merged or I say so, and never one another live thread uses: check `t3_thread_list` for its path first. A thread can't remove its own worktree; list it in your report.

## T3

T3 makes worktrees under `C:\Users\kaust\.t3\worktrees\potli\`. If a new worktree has no `node_modules`, T3 didn't run setup for you: run `bun run setup` first thing.

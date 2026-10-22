---
name: verify-potli
description: Prove a potli change works in the real app. Starts this checkout's dev server, seeds it, signs in through the UI, makes a publish token on /settings, publishes a real tarball with npm, installs it with npm and bun, and screenshots pages headless. Use before saying a registry, website, auth or token change is done, or when asked to run, open or screenshot potli.
---

# Verify potli

potli is one Worker with two surfaces: the npm API (`/@...`, `/-/...`), which npm, pnpm and bun talk to, and the website (everything else). Prove a change on the surface it touches, with a real client: npm and bun for the registry, a headless browser for the site.

Every helper is in `.agents/skills/verify-potli/scripts/` and runs from the checkout root with `node`. They work on Linux (the cloud machine, cloud VMs), Windows and macOS.

| Helper | What it does |
|---|---|
| `dev.mjs start\|status\|stop` | starts, checks and stops this checkout's dev server |
| `journey.mjs` | the whole publish journey, 13 steps, evidence in `.artifacts/verify/<run>/` |
| `shot.mjs <path> [--dark] [--width=390]` | opens one page signed out, screenshots it, prints status, h1, SSR fallback, console errors |
| `browser.mjs` | prints the browser the others use |

## Launch

The checkout must be set up first (`worktree-potli`: `bun run setup`). Then:

```
node .agents/skills/verify-potli/scripts/dev.mjs start
```

It sets `DEV_LOGIN=1` and adds `potli-verify` to `SIGNUP_ALLOWLIST` in `.dev.vars` when they're missing (both local-only), starts `bun run dev` in its own process group, waits until `/` renders, then runs the doctor below. Ready looks like `dev: ready on http://localhost:<PORT> after 10s` and six `ok` lines. The first start in a checkout takes up to a minute on Windows (Vite optimizes dependencies). The dev log is `.wrangler/verify/dev.log`.

One dev server takes about 1.3 GB. On the 8 GB cloud machine, run one at a time and stop it when you're done.

## Doctor

```
node .agents/skills/verify-potli/scripts/dev.mjs status
```

Read-only. Exit 0 means this instance is worth driving: the PID from `start` is alive, the registry answers `/-/ping`, `/` renders on the server (no "Switched to client rendering"), dev sign-in is on and `potli-verify` may sign up. Every `FAIL` prints its fix. It only trusts a server `dev.mjs start` made; a dev server you started by hand shows `FAIL dev server PID`.

## Drive

**The publish journey** covers sign-in, tokens, publish, install and the package page in one run:

```
node .agents/skills/verify-potli/scripts/journey.mjs
```

1. `bun run seed` (real READMEs from the sibling repos; see Gotchas).
2. `/sign-in`: fills **GitHub login** with `potli-verify`, clicks **Sign in**, lands on `/settings`.
3. `/settings`: fills **Token name**, clicks **Create token**, reads the token from the **Copy “<name>” now** panel.
4. `npm whoami` with that token prints `potli-verify`.
5. `npm pack ms@2.1.3` from npmjs, renamed to `@potli-verify/ms` with a fresh version `2.1.<unix seconds>`, packed again.
6. `npm publish` of that tarball; publishing it again must fail with `E409`.
7. The packument has the version as `latest`, its tarball URL uses this origin, and the served bytes have the packed tarball's sha256.
8. `npm install` and `bun add` in scratch projects with only a scope line in `.npmrc`; `require('@potli-verify/ms')('1h')` prints `3600000`.
9. `/package/@potli-verify/ms` shows the version; `/package/@kausthubh/critly` (seeded) renders; no browser console errors.

It prints `ok` or `FAIL` per step and exits 0 only when all pass. A failed early step stops the steps that need it.

**One page** (signed out):

```
node .agents/skills/verify-potli/scripts/shot.mjs /package/@kausthubh/critly
```

**Anything else**: write a short playwright-core script next to the helpers and reuse their pieces: `findBrowser()` from `browser.mjs`, `origin` and `VERIFY_LOGIN` from `dev.mjs`, the sign-in and token steps from `journey.mjs`. Use `page.goto(url, { waitUntil: "networkidle" })` before you click: a click before React hydrates submits forms as plain GETs. Prefer roles and labels (`getByLabel("Token name")`, `getByRole("button", { name: "Create token" })`) over CSS. The feature map in `features/` has the selectors for each feature.

For the registry alone, curl is enough: `curl -s localhost:<PORT>/@kausthubh%2fcritly | head -c 400`.

## Evidence

- `journey.mjs`: `.artifacts/verify/<run>/` holds `journey.json` (every step, ok or not, with what was seen), `01-settings-signed-in.png`, `02-token-created.png`, `03-package-page.png`, `04-seeded-package-page.png`, `packument.json`, and one `.log` per command (command, output, exit code).
- `shot.mjs`: `.artifacts/verify/shots/<path>-<width>.png`.
- `.artifacts/` is gitignored and survives cleanup. Attach or quote what proves your change: the action and the state after it, not only a final screen. For a registry change, the packument or install output is the proof; for a page, the screenshot plus the SSR line.
- The token never reaches the evidence: logs say `<REDACTED>` and screenshots mask the token and `.npmrc` boxes. The `.npmrc` that holds it lives in `.wrangler/verify/work/<run>/`, deleted at the end of each run. Never paste a token into a report.
- Proof standards: drive the path a user takes (the UI, the real npm and bun CLIs), never a test-only endpoint or a direct D1 write, except for `bun run seed`. Check side effects too: the packument and tarball bytes after a publish, the token list after creating one.

## Cleanup

```
node .agents/skills/verify-potli/scripts/dev.mjs stop
```

Stops only the process group `start` made (vite and workerd with it). It leaves `.artifacts/verify/` alone. Published `@potli-verify/ms` versions, the `potli-verify` user and its tokens stay in this checkout's local D1 and R2, which no other checkout sees. To start from an empty database: stop, delete `.wrangler/state`, run `bun run setup`.

## Gotchas

- `bun run seed` reads `critly`, `megha` and `kriyan` next to the main checkout. A bare cloud clone has none: the seed step fails (so the journey exits 1), the seeded-page step is skipped, and the rest still runs; report the seed failure, don't call the run green. Set `POTLI_SEED_SOURCES` to a folder that has them.
- Step 5 downloads `ms` from registry.npmjs.org, so the journey needs the internet.
- No browser: install Chrome or Chromium, or set `POTLI_BROWSER`. On a cloud VM, `node node_modules/playwright-core/cli.js install chromium` puts one where `browser.mjs` looks.
- GitHub sign-in can't be driven here (it needs OAuth keys and a GitHub account); dev sign-in exercises the same account hooks: allowlist and user scope.
- pnpm isn't on every machine. When it is, check it like the npm step: `pnpm add @potli-verify/ms` in a scratch project with the same `.npmrc` line.

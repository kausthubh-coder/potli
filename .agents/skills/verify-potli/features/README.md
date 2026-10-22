# potli verification map

The maintained list of what a potli user can do, and how to prove each works. Read this index, then the feature file for what you changed. Helpers are in `../scripts/`; `../SKILL.md` covers launch, doctor and cleanup.

| Feature | File | Driven by |
|---|---|---|
| Publish and install with npm, pnpm, bun | [publish-install.md](publish-install.md) | `journey.mjs` steps 4-8 |
| Sign in (dev sign-in; GitHub on my machine) | [sign-in.md](sign-in.md) | `journey.mjs` step 2 |
| Publish tokens on /settings | [tokens.md](tokens.md) | `journey.mjs` step 3 |
| Package page and scope page | [package-page.md](package-page.md) | `journey.mjs` step 9, `shot.mjs` |
| Search | [search.md](search.md) | `shot.mjs`, a short script |

Not mapped yet: org scope claims on /settings (**Claim an org scope**, button **Claim scope**), the account menu, dist-tags (`npm dist-tag`), the theme toggle.

## Baseline preconditions

- `bun run setup` passed, then `node ../scripts/dev.mjs start` printed `ready` and the doctor is all `ok`.
- `bun run seed` ran (journey step 1), so `@kausthubh` and `@kriyan` have packages with READMEs, versions and downloads.
- Drive only the dev server `dev.mjs start` made in this checkout.

## Driving conventions

- `page.goto(url, { waitUntil: "networkidle" })` before any click or fill.
- Roles and accessible names over CSS: `getByLabel`, `getByRole(..., { name })`.
- Website paths never start with `/@` or `/-/`; package pages are `/package/@scope/name`.
- Registry calls go through the real CLI with an `.npmrc`, or curl for reads. Never write D1 directly to make a check pass.

## Proof and skip reporting

- Capture the action and the state after it: the command and its output, or the click and the screenshot after.
- A mutation needs a second, read-only view: after a publish, the packument and an install; after creating a token, the token list.
- Name the feature file and step with each artifact. If a step can't run (no seed sources, no pnpm, no network), report it as skipped with the reason; never as passed through another path.

# Sign in

A visitor signs in with GitHub; the first sign-in creates their account and the scope named after their GitHub login, but only for logins on `SIGNUP_ALLOWLIST`. In dev, a dev sign-in form on /sign-in does the same without GitHub.

## Sub-features

- `dev-sign-in` signs in as any GitHub login, locally only (`DEV_LOGIN=1`, `vite dev`, localhost).
- `allowlist` refuses to create an account for a login not on `SIGNUP_ALLOWLIST`; existing accounts always sign in.
- `user-scope` gives a new account the scope `@<login>`.
- `github` is the real OAuth sign-in (needs `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`).

## How to get to it (user POV)

- The header's **Sign in with GitHub** button (GitHub OAuth; without keys it can't finish), or `/sign-in`, which has the dev sign-in form.
- Signed-in pages (`/settings`) redirect there when signed out (307).

## Driving it with journey.mjs

Preconditions:

- Baseline from the README; `dev.mjs status` shows `dev sign-in is on` and `potli-verify is on SIGNUP_ALLOWLIST`.

- **Sign in.** Step 2 fills **GitHub login** with `potli-verify` and clicks **Sign in**. The page lands on `/settings` with a **Publish tokens** heading; `01-settings-signed-in.png` shows `@potli-verify` under Scopes as "User scope".
- **Allowlist refusal (by hand).** Sign in as a login not on the list, e.g. `not-allowed-x`. The form shows `@not-allowed-x isn't on SIGNUP_ALLOWLIST, so no account was created.` and the URL stays `/sign-in`.

## Gotchas

- Clicking **Sign in** before hydration submits a plain GET (`/sign-in?login=...`) and nothing happens; wait for `networkidle`.
- Dev sign-in is stripped from `vite build`, so it never works against `bun run preview` or production. That's intended.
- GitHub sign-in can't be driven by an agent; check it by hand on my machine once OAuth keys exist.

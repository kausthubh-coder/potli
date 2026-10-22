# Publish tokens

A signed-in user creates named publish tokens on /settings for npm, sees each token once, and revokes them. Only a token's SHA-256 is stored.

## Sub-features

- `create` makes a token and shows it once, with ready `.npmrc` lines.
- `list` shows each token's name, created date and last use.
- `revoke` removes a token; npm calls with it then fail with 401.
- `name-check` refuses empty or over-long names inline.

## How to get to it (user POV)

- Account menu → **Settings**, or `/settings`, section **Publish tokens**.

## Driving it with journey.mjs

Preconditions:

- Signed in (sign-in.md).

- **Create.** Step 3 fills **Token name** with `verify-<time>` and clicks **Create token**. A region named **Copy “verify-<time>” now** appears with the token and the `.npmrc` lines; the list below gains a row with that name and "Never used".
- **Use.** Step 4 (`npm whoami`) succeeds with the token; reload /settings and the row's "Never used" changes to a last-used time.
- **Revoke (by hand).** Click **Revoke…** on the row and confirm. The row disappears; `npm whoami` with that token now fails with 401.
- **Proof.** `02-token-created.png` (token boxes masked) and `npm-whoami.log`.

## Gotchas

- The token is shown once. Read it from the panel's `.font-mono` box right after creating it.
- Never put a token in a report, a screenshot or a commit. Mask both boxes (`mask:` in `page.screenshot`).

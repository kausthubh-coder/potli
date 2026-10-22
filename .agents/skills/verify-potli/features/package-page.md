# Package and scope pages

Anyone can open `/package/@scope/name` to read a package's README, its versions and install steps, and `/scope/<scope>` to list a scope's packages. Both render on the server.

## Sub-features

- `readme` renders the latest version's README, sanitized, with heading anchors.
- `versions` tab (`?tab=versions`) lists every version with its publish date and dist-tags.
- `install-box` shows the scope's `.npmrc` line and the install command for npm, pnpm and bun.
- `details` shows version, published date, tarball size, license, links, dependencies, weekly downloads.
- `scope-page` lists a scope's packages.
- `not-found` shows a package-not-found page with a 404.

## How to get to it (user POV)

- Search results, the home page's package list, a scope page, or the URL. `/package/kausthubh/critly` redirects (301) to `/package/@kausthubh/critly`; scope pages go the other way, `/scope/@kausthubh` redirects to `/scope/kausthubh`.

## Driving it with shot.mjs

Preconditions:

- Baseline from the README (seeded).

- **README.** Run `node ../scripts/shot.mjs /package/@kausthubh/critly`. `status 200`, h1 `@kausthubh/critly`, `ssr rendered on the server`, `console no errors`; the screenshot shows the README and the install box.
- **Versions.** Run `node ../scripts/shot.mjs "/package/@kausthubh/critly?tab=versions"`. The screenshot lists 0.1.0 through 0.3.0-beta.1, `next` on the beta and `latest` on 0.2.1.
- **Scope.** Run `node ../scripts/shot.mjs /scope/kausthubh`. h1 `@kausthubh`; the list shows critly and megha.
- **Mobile and dark.** Add `--width=390 --dark`.
- **Not found.** Run `node ../scripts/shot.mjs /package/@kausthubh/nope`. Exit 1 with `status 404`; the screenshot shows the not-found page.
- **Fresh publish.** journey.mjs step 9 opens `/package/@potli-verify/ms` after publishing and waits for the new version text (`03-package-page.png`).

## Gotchas

- Seeded versions have no R2 objects, so their tarball links 404; publish with the journey to test downloads.
- Downloads are per UTC day; a fresh install shows up in today's bar at once.

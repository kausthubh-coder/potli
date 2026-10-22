# Publish and install

A user publishes a scoped package with `npm publish` and a token, and anyone installs it with npm, pnpm or bun after adding one `.npmrc` line for the scope. Published versions never change.

## Sub-features

- `whoami` answers with the token's GitHub login.
- `publish` stores the manifest in D1 and the tarball in R2.
- `immutable` refuses a second publish of the same version with 409.
- `packument` lists every version and dist-tags; tarball URLs use the request's origin.
- `install` works from npm, pnpm and bun with only a scope line in `.npmrc`.
- `downloads` counts each tarball download (shown on the package page).

## How to get to it (user POV)

- `.npmrc`: `@<scope>:registry=http://localhost:<PORT>/` and `//localhost:<PORT>/:_authToken=<token>` (the token panel on /settings prints both lines).
- `npm whoami --registry http://localhost:<PORT>/`, `npm publish`, `npm install @scope/name`, `bun add @scope/name`, `pnpm add @scope/name`.

## Driving it with journey.mjs

Preconditions:

- Baseline from the README. Internet access to registry.npmjs.org (the source tarball).

- **Whoami.** Step 4 runs `npm whoami` with the token. Stdout is `potli-verify`.
- **Publish.** Steps 5-6 pack `ms@2.1.3` as `@potli-verify/ms@2.1.<unix seconds>` and run `npm publish <tgz>`. Stdout ends `+ @potli-verify/ms@<version>`.
- **Immutable.** Step 6 publishes the same tarball again. npm exits non-zero with `E409` and `409 Conflict ... published versions never change`.
- **Packument and bytes.** Step 7 fetches `/@potli-verify%2fms`. `dist-tags.latest` is the new version, `dist.tarball` starts with `http://localhost:<PORT>/`, and the served tarball's sha256 equals the packed file's.
- **Install.** Step 8 runs `npm install` and `bun add` in scratch projects. `node_modules/@potli-verify/ms/package.json` has the version and `require('@potli-verify/ms')('1h')` prints `3600000`.
- **Proof.** `npm-*.log`, `bun-install.log`, `packument.json` and `journey.json` in `.artifacts/verify/<run>/`.

## Gotchas

- Unscoped names never reach the registry: `npm install ms` goes to npmjs. Always use a scope with its `.npmrc` line.
- A prerelease version needs `npm publish --tag <tag>` on npm 11; the journey uses a plain version for that reason.
- Tarballs over 10 MB and request bodies over 16 MB are refused by design.
- bun caches a packument and reuses it without asking the registry, whatever `Cache-Control`, `ETag` or `Last-Modified` say (tested with bun 1.4.3: it requested the packument once, then `bun add` of a version published a moment later failed with `No version matching ... (but package exists)`). A user who installs right after publishing needs `bun add --no-cache`. The journey gives bun its own `BUN_INSTALL_CACHE_DIR` per run for that reason; when you `bun add` by hand after a publish, do the same or pass `--no-cache`.
- Each install also counts as a download, so the package page's weekly downloads go up by one per client.

# The npm registry protocol, as potli implements it

npm, pnpm, bun and yarn all speak this protocol. There is no formal spec; npm's own registry is
the reference. When in doubt, compare against `https://registry.npmjs.org` with curl.

## Routing

The Worker sends every path starting with `/@` or `/-/` to the registry (Hono, in
`src/features/registry/`). Everything else is the website. The website never uses those prefixes;
package pages live at `/package/@scope/name`.

Clients encode the slash in scoped names: `/@scope%2fname` (npm, bun) and sometimes `%2F`
(pnpm). Accept both encodings and the plain `/@scope/name`.

Only scoped names exist. An unscoped name is a 404, never a proxy to npmjs.

## Install (read path, no auth)

`GET /@scope%2fname` returns the packument:

```json
{
  "_id": "@scope/name",
  "name": "@scope/name",
  "description": "...",
  "dist-tags": { "latest": "1.2.0" },
  "versions": {
    "1.2.0": {
      "name": "@scope/name",
      "version": "1.2.0",
      "dependencies": {},
      "dist": {
        "tarball": "<origin>/@scope/name/-/name-1.2.0.tgz",
        "integrity": "sha512-<base64>",
        "shasum": "<sha1 hex>"
      }
    }
  },
  "time": { "created": "...", "modified": "...", "1.2.0": "..." },
  "readme": "..."
}
```

- `<origin>` is the origin of the incoming request, never a hard-coded domain, so the same data
  works on workers.dev, localhost and a future custom domain. The manifest stored in D1 has no
  `dist.tarball`; it is added on read.
- Clients may send `Accept: application/vnd.npm.install-v1+json` and expect the abbreviated
  form (name, modified, dist-tags, and per version only install fields). Returning the full
  document is allowed and works; add the abbreviated form only as an optimization.
- `GET /@scope/name/-/name-1.2.0.tgz` streams the tarball from R2 (`application/octet-stream`).
  Stream it; never buffer it into memory. Count the download in D1 (`ctx.waitUntil`).
- Versions are immutable, so tarballs can be cached forever. Packuments change on publish.

## Publish (write path, token auth)

`npm publish` sends `PUT /@scope%2fname` with `Authorization: Bearer <token>` and a JSON body:

```json
{
  "_id": "@scope/name",
  "name": "@scope/name",
  "description": "...",
  "dist-tags": { "latest": "1.2.0" },
  "versions": { "1.2.0": { "...manifest...": "", "dist": { "integrity": "...", "shasum": "...", "tarball": "..." } } },
  "readme": "...",
  "_attachments": {
    "name-1.2.0.tgz": { "content_type": "application/octet-stream", "data": "<base64>", "length": 1234 }
  }
}
```

Checks before writing anything:

1. Token valid (SHA-256 of it matches `tokens.token_hash`); else 401.
2. The name in the URL, `_id`, `name` and the version manifest's `name` all agree.
3. The scope exists and the token's user owns it; else 403.
4. Exactly one version and one attachment. The version is valid semver and not already published
   (409 if it is: versions are immutable).
5. The decoded tarball's sha512 and sha1 match `dist.integrity` and `dist.shasum`.
6. Size limit on the tarball.

Then write the tarball to R2, then the D1 rows (package, version, dist-tags) in one batch.
Reply `201` with `{ "ok": true }`. Error replies are JSON `{ "error": "<message>" }`; npm prints
the message to the user, so make it say what to do.

## Other endpoints npm calls

- `GET /-/ping`: `{}`.
- `GET /-/whoami` (auth): `{ "username": "<github login>" }`.
- `PUT /-/package/@scope%2fname/dist-tags/<tag>` with a JSON string body (the version): set a tag.
- `GET /-/v1/search?text=...&size=20`: `{ "objects": [{ "package": {...} }], "total": n, "time": "..." }`.
- Web login (`npm login --auth-type=web`): `POST /-/v1/login` returns `{ loginUrl, doneUrl }`;
  the client polls `doneUrl` until it gets `{ token }`. Later.

## Client setup a user does

```ini
# .npmrc
@scope:registry=https://<registry origin>/
//<registry host>/:_authToken=<token from potli settings>   # publishing only
```

# The npm registry protocol, as potli implements it

npm, pnpm, bun and yarn all speak this protocol. There is no formal spec; npm's own registry is
the reference. When in doubt, compare against `https://registry.npmjs.org` with curl.

## Routing

The Worker sends every path starting with `/@` or `/-/` to the registry (Hono, in
`src/features/registry/`). Everything else is the website. The website never uses those prefixes;
package pages live at `/package/@scope/name`.

Clients encode the slash in scoped names: `/@scope%2fname` (npm, bun) and sometimes `%2F`
(pnpm). Accept both encodings and the plain `/@scope/name`. The Hono app's `getPath` decodes the
slash after the scope (`decodeScopedSlash` in `registry.names.ts`), so routes match the plain form.

Only scoped names exist. An unscoped name is a 404, never a proxy to npmjs. Every 404 body is
`{ "error": "Not found" }`, which npm prints as "'@scope/name@*' is not in this registry."

The registry reads bindings from `cloudflare:workers` (`env`, `waitUntil`), not from Hono's
`c.env`, so tests call `registry.request(path, init)` exactly as a client would.

Files: `registry.api.ts` (routes), `registry.publish.ts` (publish checks and writes),
`registry.auth.ts` (tokens and scope ownership), `registry.names.ts` (names and tarball URLs).

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
- `time.created` and `time.modified` are `packages.created_at` and `updated_at`. Each version's
  time is `versions.published_at`. Versions are listed in publish order.
- Clients may send `Accept: application/vnd.npm.install-v1+json` and expect the abbreviated
  form (name, modified, dist-tags, and per version only install fields). potli always returns the
  full document, which npm, pnpm and bun accept. The abbreviated form is a later optimization.
- `GET /@scope/name/-/name-1.2.0.tgz` looks up the version in D1, then streams the tarball from
  R2 (`application/octet-stream`, with `Content-Length` and `ETag`). It never buffers the
  tarball. A GET (not a HEAD) adds one to `downloads` for the package and UTC day, in
  `waitUntil` after the response. A version row whose R2 object is missing is a 500.
- Versions are immutable, so tarballs carry `Cache-Control: public, max-age=31536000, immutable`.
  Packuments change on publish and on dist-tag changes.

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
    "@scope/name-1.2.0.tgz": { "content_type": "application/octet-stream", "data": "<base64>", "length": 1234 }
  }
}
```

npm keys the attachment by the full name (`@scope/name-1.2.0.tgz`), so potli takes the one
attachment whatever its key.

Checks before writing anything, in this order:

1. Token valid (SHA-256 of it matches `tokens.token_hash`); else 401. Every authenticated request
   sets `tokens.last_used_at`.
2. The body is JSON with exactly one version and one attachment; else 400.
3. The name in the URL, `name`, the version manifest's `name` and `_id` (when sent) all agree;
   else 400.
4. The scope exists and the token's user owns it; else 403. The message differs for an unclaimed
   scope and someone else's scope.
5. The version key equals the manifest's `version` and is valid semver (semver.org's regex);
   else 400. A version already in D1 is a 409: versions are immutable.
6. The tarball is at most 10 MB; else 413. The request body is capped at 16 MB while it streams in
   (Hono `bodyLimit`), also 413.
7. The decoded tarball's sha512 and sha1 equal `dist.integrity` and `dist.shasum` exactly; else 400.
8. Every dist-tag in the body points at the version being published; else 400. No dist-tags
   means `latest`.

Then potli writes the tarball to R2 at `@scope/name/<version>/<sha1>.tgz`, then the D1 rows
(package, version, dist-tags) in one batch. The sha1 in the key means a retried or racing publish
never overwrites the bytes D1 points at. If two publishes of one version race past check 5, the
`versions` primary key rejects the second and it gets the same 409.

D1 stores the manifest as sent minus `dist.tarball`. `packages.description` and `readme` come
from the body (falling back to the manifest) and change only when the publish moves `latest` or
creates the package, so a `beta` publish leaves the package page alone.

Reply `201` with `{ "ok": true }`. Error replies are JSON `{ "error": "<message>" }`. npm prints
the message after the status line, so each message says what to do.

npm 11 fetches the packument before publishing and refuses an existing version itself ("You
cannot publish over the previously published versions"). The server's 409 message shows with
`npm publish --force`, with other clients, and when two publishes race.

## Other endpoints npm calls

- `GET /-/ping`: `{}`.
- `GET /-/whoami` (auth): `{ "username": "<github login>" }`. 401 without a valid token.
- `GET /-/package/@scope%2fname/dist-tags`: `{ "<tag>": "<version>" }`. `npm dist-tag ls`, and
  `add`/`rm` read it first.
- `PUT /-/package/@scope%2fname/dist-tags/<tag>` (auth, scope owner) with a JSON string body (the
  version): sets the tag and replies `201 { "ok": true }`. The version must be published (404).
  The tag can't be a semver version or need URL encoding (400).
- `DELETE /-/package/@scope%2fname/dist-tags/<tag>` (auth, scope owner): `{ "ok": true }`, or 404
  for a tag that doesn't exist. `latest` can't be deleted (400), because clients install it when
  no version is asked for.
- `GET /-/v1/search?text=...&size=20&from=0`: a case-insensitive `LIKE` over package names and
  descriptions, ordered by name. `size` is 1 to 250 (default 20). The reply follows npm's shape:

  ```json
  {
    "objects": [{
      "package": {
        "name": "@scope/name", "scope": "scope", "version": "<latest>", "description": "...",
        "keywords": [], "date": "<latest's publish time>",
        "links": { "npm": "<origin>/package/@scope/name" },
        "publisher": { "username": "<scope owner>" }, "maintainers": [{ "username": "<scope owner>" }]
      },
      "score": { "final": 1, "detail": { "quality": 1, "popularity": 1, "maintenance": 1 } },
      "searchScore": 1
    }],
    "total": 1,
    "time": "<UTC date string>"
  }
  ```

  There is no ranking yet, so every score is 1.
- Web login (`npm login --auth-type=web`): `POST /-/v1/login` returns `{ loginUrl, doneUrl }`;
  the client polls `doneUrl` until it gets `{ token }`. Later.

## Errors

An uncaught error returns `500 { "error": "The registry hit an unexpected error. ..." }` and logs
it. When `POSTHOG_KEY` is set, `waitUntil` also posts a `$exception` event to
`https://us.i.posthog.com/i/v0/e/` with the error's name, message and stack plus the method and
path. It never sends headers or the query string.

## Client setup a user does

```ini
# .npmrc
@scope:registry=https://<registry origin>/
//<registry host>/:_authToken=<token from potli settings>   # publishing only
```

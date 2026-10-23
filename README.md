# potli

potli is an npm registry for scoped packages, running on one Cloudflare Worker. npm, pnpm, bun
and yarn install from it and publish to it with no plugin. Each package gets a page with its
README and versions.

A *potli* is a small cloth bundle tied at the top. A package tarball is a bundle too.

## Install a package from potli

Tell your package manager which registry serves the scope, then install as usual:

```ini
# .npmrc
@kausthubh:registry=https://potli.kausthubh2007.workers.dev/
```

```sh
bun add @kausthubh/critly
```

Packages outside that scope still come from npmjs.

## Run it locally

```sh
bun install
bun run setup   # env files, a free port, the local database
bun run dev
```

You need [bun](https://bun.sh). Sign-in needs a GitHub OAuth app; put its keys in `.dev.vars`.

## Stack

TanStack Start renders the website and Hono serves the npm API, both in one Worker. D1 (through
Drizzle) stores packages, versions, users and tokens. R2 stores tarballs. Better Auth handles
sign-in with GitHub.

`docs/registry-protocol.md` describes the HTTP API that npm clients use.

## License

MIT

# Decisions

Made with the developer when the project started (2026-10-22). Change them only with them.

- **Scoped names only.** npm clients pick a registry per scope, not per name, so unscoped names
  would mean proxying all of npmjs and invite dependency confusion. Same model as jsr.io.
- **Scopes.** Signing in with GitHub gives you the scope matching your GitHub login. Any other free
  name can be claimed as an org scope. Popular names (npm, react, vercel, cloudflare, ...) are
  reserved. Scope names follow npm rules: lowercase, url-safe.
- **Other people's packages:** the data model supports them from day one, but sign-up stays
  closed until size and rate limits, report and takedown, and a terms page exist.
- **Tarball URLs come from the request origin.** The registry starts on
  `potli.<subdomain>.workers.dev` and moves to a bought domain later; workers.dev stays enabled
  after that so old lockfiles keep working.
- **Existing packages** (t3-megha, @kausthubh/critly) keep publishing to npmjs as well.
- **Stack:** one Cloudflare Worker. TanStack Start (React) for the site, Hono for the npm API,
  D1 with Drizzle, R2 for tarballs, Better Auth with GitHub only, PostHog for site analytics and
  server errors. Download counts live in D1, not PostHog.
- **Not Convex or Vercel:** registry traffic is mostly tarball downloads, and R2 has no egress
  fees; D1 sits next to the Worker, so installs make no extra network hop.

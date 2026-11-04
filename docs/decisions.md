# Decisions

Made with the developer when the project started (2026-10-22). Change them only with them.

- **Scoped names only.** npm clients pick a registry per scope, not per name, so unscoped names
  would mean proxying all of npmjs and invite dependency confusion. Same model as jsr.io.
- **Scopes.** Signing in with GitHub gives you the scope matching your GitHub login. Any other free
  name can be claimed as an org scope. Popular names (npm, react, vercel, cloudflare, ...) are
  reserved. Scope names follow npm rules: lowercase, url-safe.
- **Other people's packages:** the data model supports them from day one. Sign-up opened to
  anyone with GitHub on 2026-11-04, at the developer's call. The safeguards it needed landed the
  same day: size limits (already there), rate limits, report and takedown, and a terms page.
- **Rate limits** are fixed-window counters in D1 (`src/lib/rate-limit.ts`), not the Workers
  rate-limiting binding, whose windows are only 10 or 60 seconds and count per Cloudflare
  location. Per account: 60 publishes an hour, 10 new tokens an hour, 20 scope claims a day. Per
  IP address (a salted hash, kept a day): 30 sign-ins per 10 minutes, 10 new-account attempts an
  hour, 10 reports an hour. Installs, packuments and tarballs are never limited.
- **Takedowns hide, never delete.** A taken-down version or package keeps its D1 rows and R2
  tarball, so its version numbers can't be published again and published versions still never
  change. The registry answers 410 with a message; the website says it was taken down. Admins are
  the GitHub logins in `ADMIN_LOGINS`. There's no undo on the website yet (`docs/ops.md`).
- **Tarball URLs come from the request origin.** The registry starts on
  `potli.kausthubh2007.workers.dev` and moves to a bought domain later; workers.dev stays enabled
  after that so old lockfiles keep working.
- **Existing packages** (t3-megha, @kausthubh/critly) keep publishing to npmjs as well.
- **Stack:** one Cloudflare Worker. TanStack Start (React) for the site, Hono for the npm API,
  D1 with Drizzle, R2 for tarballs, Better Auth with GitHub only, PostHog for site analytics and
  server errors. Download counts live in D1, not PostHog.
- **Not Convex or Vercel:** registry traffic is mostly tarball downloads, and R2 has no egress
  fees; D1 sits next to the Worker, so installs make no extra network hop.

# Reports, takedowns, rate limits, terms

Driven by `../scripts/moderation.mjs` (about 3 minutes; `--skip-burst` leaves out the publish loop). It signs in as `potli-verify` and `potli-verify-admin` (`dev.mjs start` puts the second in `ADMIN_LOGINS`).

| Step | What a user does | What proves it |
|---|---|---|
| Report | Package page, button **Report this package**, form named **Report @scope/name**: radio by reason label, **Version** select, **Details**, **Send report** | the text "Thanks. Your report went to potli's admin." |
| Admin queue | `/admin` (404 for everyone else), one `article` named **Report about @scope/name@1.0.1** per open report | buttons **Take down 1.0.1**, **Take down the package**, **Dismiss**; a native confirm before a takedown |
| Version takedown | admin clicks **Take down 1.0.1** | packument drops 1.0.1 and `latest` moves; `npm ci` from a lockfile prints `410 Gone ... was taken down`; `bun install --frozen-lockfile` fails with `410`; `npm publish` of 1.0.1 prints `409 Conflict ... was taken down`; Versions tab shows a **taken down** tag |
| Package takedown | admin clicks **Take down the package** | `npm install` prints `410 Gone ... was taken down`; the page's h1 is "@scope/name was taken down" (served as a 404) |
| Publish limit | 61st `npm publish` in a clock hour from one account | `npm error 429 Too Many Requests ... potli allows 60 publishes an hour`; npm waits about 70 s retrying first |
| Terms | footer link **Terms**, sign-in page link **terms** | `shot.mjs /terms` |

Sign-in, token and scope limits and the sign-up limit are covered by `src/lib/rate-limit.test.ts`; driving them in the browser would lock the dev login out for the hour. `/sign-in?error=rate_limited` shows the copy a limited sign-in lands on.

Evidence: `.artifacts/verify/<run>-moderation/`, with each page in `-light`, `-dark` and `-phone` (390px).

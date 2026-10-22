# Search

Anyone can search packages by name or description from the header search box or `/search`. Results link to package pages.

## Sub-features

- `header-search` jumps to `/search?q=<text>` from any page (`/` focuses it).
- `results` ranks matching packages by name and description.
- `empty` shows a no-results state.

## How to get to it (user POV)

- The header's **Search packages** box (press `/`), or `/search?q=<text>`.

## Driving it with shot.mjs

Preconditions:

- Baseline from the README (seeded).

- **Results.** Run `node ../scripts/shot.mjs "/search?q=critly"`. Title `“critly” · Search · potli`; the screenshot lists `@kausthubh/critly`.
- **Empty.** Run `node ../scripts/shot.mjs "/search?q=zzzz-nothing"`. The page says `No packages match “zzzz-nothing”`.
- **Header box (script).** `page.goto(origin, { waitUntil: "networkidle" })`, `page.keyboard.press("/")`, `page.getByRole("searchbox", { name: "Search packages" }).fill("megha")` (fall back to `getByLabel("Search packages").first()` if the role differs), `Enter`. The URL becomes `/search?q=megha` and `@kausthubh/megha` is listed.
- **Registry search.** `curl -s "localhost:<PORT>/-/v1/search?text=critly"` returns `objects[0].package.name` `@kausthubh/critly` (what `npm search` calls).

## Gotchas

- The header box and the /search page box share the accessible name **Search packages**; scope locators to `header` or `main`.

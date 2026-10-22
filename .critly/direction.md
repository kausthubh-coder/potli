# Direction

Subject: potli, an open-source npm registry for scoped packages; developers land here to see what a package is and copy how to install it.
Job: the package's name, what it does, and the two install lines (.npmrc, then npm/pnpm/bun), before anything else.
Kept: split first screen, headline left and a real package's install card right, because the product shows at first glance. Also tried: a centered search-led hero, which pushed the install steps below the fold on phones.
References: jsr.io (install box is first-class, right under the name); pkg.go.dev (metadata as a quiet right column, README is the page); a shipping tag tied to a bundle (one small card that says what's inside and where it goes).

## Materials
- Type: IBM Plex Sans (variable) for everything; IBM Plex Mono for commands, versions and code. One family, set by weight and size. Fraunces was tried for the headline and dropped: its "@" read as a circled a.
- Palette: unbleached cotton ground oklch(0.983 0.006 85), indigo ink oklch(0.24 0.03 268), indigo accent oklch(0.46 0.16 268) for links, the current tab and the current week only. Dark is indigo night oklch(0.175 0.018 268) with cotton text and a lighter accent oklch(0.76 0.11 268). Tokens in src/styles.css use shadcn role names.
- Shape: 8px controls, 12px cards; cards separate by a hairline border plus a soft shadow; rows inside cards separate by fill tone, never a second border.
- Imagery: the product itself, a real package's install card; no illustrations.
- Signature: the potli mark, a cloth bundle tied at the top with an indigo tie; in the header, footer, favicon and big on 404 pages.
- Voice: plain, specific, calm. Errors say what happened and what to do next.
- Density and pace: package pages comfortable for reading (16px, ~70 characters a line); lists compact; every interaction instant, no entrance animation.

## Standard
Layout, navigation, controls and states follow the platform and Critly's concepts.

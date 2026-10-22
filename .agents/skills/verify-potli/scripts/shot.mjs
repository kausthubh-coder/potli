// Opens one page of this checkout's dev server headless, screenshots it, and prints what a reader
// would check: status, title, h1, client-rendering fallback, console errors.
//
//   node .agents/skills/verify-potli/scripts/shot.mjs /search?q=critly
//   node .agents/skills/verify-potli/scripts/shot.mjs /package/@kausthubh/critly --dark --width=390
//
// Signed-out only: for signed-in pages use journey.mjs, which signs in through the UI.
// Screenshots go to .artifacts/verify/shots/. Exit 1 when the page isn't a 200, falls back to
// client rendering, or logs a console error.
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { findBrowser } from "./browser.mjs";
import { origin } from "./dev.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..", "..");
const path = process.argv.slice(2).find((a) => a.startsWith("/"));
if (!path) {
	console.error("usage: node .agents/skills/verify-potli/scripts/shot.mjs <path> [--dark] [--width=<px>]");
	process.exit(2);
}
const width = Number(process.argv.find((a) => a.startsWith("--width="))?.slice(8) ?? 1280);
const dark = process.argv.includes("--dark");
const executablePath = findBrowser();
if (!executablePath) throw new Error("no browser: install Chrome or Chromium, or set POTLI_BROWSER");

const out = join(root, ".artifacts", "verify", "shots");
mkdirSync(out, { recursive: true });
const file = join(
	out,
	`${path.replace(/[^a-z0-9@._-]+/gi, "_").replace(/^_|_$/g, "") || "home"}${dark ? "-dark" : ""}-${width}.png`,
);

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({
	viewport: { width, height: 900 },
	colorScheme: dark ? "dark" : "light",
});
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
const res = await page.goto(`${origin}${path}`, { waitUntil: "networkidle" });
// The server's own HTML: the browser may have dropped the response body by now.
const html = await (await fetch(`${origin}${path}`)).text();
const fallback = html.includes("Switched to client rendering");
await page.screenshot({ path: file, fullPage: true });
const h1 = await page
	.locator("h1")
	.first()
	.innerText({ timeout: 2000 })
	.catch(() => "(none)");
console.log(`status   ${res?.status()} ${page.url()}`);
console.log(`title    ${await page.title()}`);
console.log(`h1       ${h1}`);
console.log(`ssr      ${fallback ? "FELL BACK to client rendering" : "rendered on the server"}`);
console.log(`console  ${errors.length ? errors.slice(0, 3).join(" | ") : "no errors"}`);
console.log(`shot     ${file.slice(root.length + 1)}`);
await browser.close();
process.exit(res?.status() === 200 && !fallback && errors.length === 0 ? 0 : 1);

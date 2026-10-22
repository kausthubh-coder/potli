// Finds a Chromium-family browser for playwright-core, which ships no browser of its own.
// Order: $POTLI_BROWSER, then Chrome, Edge or Chromium in their usual places, then a Chromium
// that Playwright installed under $PLAYWRIGHT_BROWSERS_PATH (what a cloud VM has).
// Run it directly to see what it picks: node .agents/skills/verify-potli/scripts/browser.mjs
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function findBrowser() {
	const candidates = [process.env.POTLI_BROWSER];
	if (process.platform === "win32") {
		for (const base of [
			process.env.PROGRAMFILES,
			process.env["PROGRAMFILES(X86)"],
			process.env.LOCALAPPDATA,
		]) {
			if (!base) continue;
			candidates.push(join(base, "Google", "Chrome", "Application", "chrome.exe"));
			candidates.push(join(base, "Microsoft", "Edge", "Application", "msedge.exe"));
		}
	} else if (process.platform === "darwin") {
		candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
		candidates.push("/Applications/Chromium.app/Contents/MacOS/Chromium");
	} else {
		candidates.push(
			"/usr/bin/google-chrome",
			"/usr/bin/google-chrome-stable",
			"/usr/bin/chromium",
			"/usr/bin/chromium-browser",
		);
	}
	const playwrightDir = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), ".cache", "ms-playwright");
	if (existsSync(playwrightDir)) {
		for (const dir of readdirSync(playwrightDir)
			.filter((d) => d.startsWith("chromium-"))
			.sort()
			.reverse()) {
			candidates.push(join(playwrightDir, dir, "chrome-linux", "chrome"));
			candidates.push(join(playwrightDir, dir, "chrome-linux64", "chrome"));
			candidates.push(join(playwrightDir, dir, "chrome-win", "chrome.exe"));
		}
	}
	return candidates.find((path) => path && existsSync(path)) ?? null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const found = findBrowser();
	console.log(found ?? "no browser found: install Chrome or Chromium, or set POTLI_BROWSER to one");
	process.exit(found ? 0 : 1);
}

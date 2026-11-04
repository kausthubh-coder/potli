// Report, takedown and rate limits, driven for real against this checkout's dev server:
//   sign in and make a token -> npm publish two versions of a real package -> bun add it (lockfile)
//   -> a signed-out visitor reports 1.0.1 on its page -> the admin takes 1.0.1 down on /admin ->
//   the packument hides it, `bun install` from the lockfile and `npm install` of 1.0.1 fail with the
//   takedown message, a fresh `bun add` gets 1.0.0, `npm publish` of 1.0.1 is refused -> a second
//   report, the admin takes the whole package down -> `npm install` fails -> `npm publish` in a loop
//   until potli answers 429 (as the admin login, so the journey's login keeps its publishes).
//
//   node .agents/skills/verify-potli/scripts/dev.mjs start
//   node .agents/skills/verify-potli/scripts/moderation.mjs [--skip-burst]
//
// Evidence goes to .artifacts/verify/<run>-moderation/: moderation.json, screenshots of each page in
// light, dark and 390px, and every npm and bun log. Tokens are <REDACTED>. Exit 0 only when every
// step passed. The burst uses up the admin login's publishes for the current clock hour.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { findBrowser } from "./browser.mjs";
import { origin, port, VERIFY_ADMIN_LOGIN, VERIFY_LOGIN } from "./dev.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..", "..");
const run = `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-moderation`;
const out = join(root, ".artifacts", "verify", run);
const work = join(root, ".wrangler", "verify", "work", run);
mkdirSync(out, { recursive: true });
mkdirSync(work, { recursive: true });

const scope = `@${VERIFY_LOGIN}`;
const base = `mod-${Math.floor(Date.now() / 1000)}`;
const name = `${scope}/${base}`;
const tokens = [];
const redact = (text) => tokens.reduce((s, t) => s.replaceAll(t, "<REDACTED>"), String(text));
const steps = [];
const step = async (label, fn) => {
	const started = Date.now();
	try {
		const seen = await fn();
		steps.push({
			step: label,
			ok: true,
			ms: Date.now() - started,
			seen: redact(JSON.stringify(seen ?? null)),
		});
		console.log(
			`ok   ${label}${seen ? `: ${redact(typeof seen === "string" ? seen : JSON.stringify(seen))}` : ""}`,
		);
		return seen;
	} catch (error) {
		steps.push({ step: label, ok: false, ms: Date.now() - started, error: redact(error?.message ?? error) });
		console.log(`FAIL ${label}: ${redact(error?.message ?? error)}`);
		return undefined;
	}
};
const sh = (label, command, cwd, env = process.env) => {
	const started = Date.now();
	const r = spawnSync(command, { cwd, env, shell: true, encoding: "utf8", timeout: 300_000 });
	const ms = Date.now() - started;
	const text = `$ ${command}\n${r.stdout ?? ""}${r.stderr ?? ""}\n[exit ${r.status} after ${ms} ms]\n`;
	writeFileSync(join(out, `${label}.log`), redact(text));
	return { status: r.status, stdout: (r.stdout ?? "").trim(), stderr: (r.stderr ?? "").trim(), ms };
};
const must = (cond, message) => {
	if (!cond) throw new Error(message);
};
const errorLine = (r, pattern) =>
	`${r.stdout}\n${r.stderr}`
		.split("\n")
		.find((l) => pattern.test(l))
		?.trim();

if (!port) throw new Error("no PORT in .env.local: run bun run setup");
const executablePath = findBrowser();
if (!executablePath) throw new Error("no browser: install Chrome or Chromium, or set POTLI_BROWSER");
const browser = await chromium.launch({ executablePath, headless: true });
const consoleErrors = [];
const newPage = async (context) => {
	const page = await context.newPage();
	// A stuck page fails its step instead of hanging the run.
	page.setDefaultTimeout(30_000);
	page.on("console", (m) => m.type() === "error" && consoleErrors.push(`${page.url()}: ${m.text()}`));
	page.on("pageerror", (e) => consoleErrors.push(`${page.url()}: ${e}`));
	return page;
};
// Light at 1280px, dark at 1280px, light at 390px (a phone).
const VARIANTS = [
	{ suffix: "light", width: 1280, scheme: "light" },
	{ suffix: "dark", width: 1280, scheme: "dark" },
	{ suffix: "phone", width: 390, scheme: "light" },
];
const shoot = async (page, file, prepare) => {
	for (const v of VARIANTS) {
		await page.setViewportSize({ width: v.width, height: 900 });
		await page.emulateMedia({ colorScheme: v.scheme });
		if (prepare) await prepare();
		await page.screenshot({ path: join(out, `${file}-${v.suffix}.png`), fullPage: true });
	}
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.emulateMedia({ colorScheme: "light" });
};

async function signInWithToken(context, login) {
	const page = await newPage(context);
	await page.goto(`${origin}/sign-in`, { waitUntil: "networkidle" });
	await page.getByLabel("GitHub login").fill(login);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await page.waitForURL(`${origin}/settings`, { timeout: 30_000 });
	const tokenName = `moderation-${run.slice(11, 19)}`;
	await page.getByLabel("Token name").fill(tokenName);
	await page.getByRole("button", { name: "Create token" }).click();
	const shown = page.getByRole("region", { name: `Copy “${tokenName}” now` });
	await shown.waitFor({ timeout: 30_000 });
	const token = (await shown.locator(".font-mono").first().innerText()).trim();
	must(token.length >= 20, `no token for ${login}`);
	tokens.push(token);
	const npmrc = join(work, `${login}.npmrc`);
	writeFileSync(npmrc, `@${login}:registry=${origin}/\n//localhost:${port}/:_authToken=${token}\n`);
	return { page, npm: `npm --userconfig "${npmrc}"` };
}

// A real package (ms from npmjs) in a folder whose package.json we rename and re-version.
function packageDir(dirName, pkgName) {
	const dir = join(work, dirName);
	mkdirSync(dir, { recursive: true });
	let r = sh(`${dirName}-pack-source`, "npm pack ms@2.1.3 --registry https://registry.npmjs.org/", dir);
	must(r.status === 0, "couldn't download ms@2.1.3 from npmjs");
	r = sh(`${dirName}-untar`, "tar -xzf ms-2.1.3.tgz", dir);
	must(r.status === 0, "couldn't unpack ms-2.1.3.tgz");
	const pkgDir = join(dir, "package");
	const pkgPath = join(pkgDir, "package.json");
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
	return {
		dir: pkgDir,
		setVersion: (version) =>
			writeFileSync(pkgPath, `${JSON.stringify({ ...pkg, name: pkgName, version }, null, 2)}\n`),
	};
}

function consumer(label) {
	const dir = join(work, label);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "package.json"), '{ "name": "consumer", "private": true }\n');
	writeFileSync(join(dir, ".npmrc"), `${scope}:registry=${origin}/\n`);
	return dir;
}
// bun caches packuments and ignores Cache-Control, so every bun command gets its own cache.
const bunEnv = (label) => ({ ...process.env, BUN_INSTALL_CACHE_DIR: join(work, `bun-cache-${label}`) });

async function reportOnPage(context, { version, reasonLabel, details, shots }) {
	const page = await newPage(context);
	await page.goto(`${origin}/package/${name}`, { waitUntil: "networkidle" });
	await page.getByRole("button", { name: "Report this package" }).click();
	const form = page.getByRole("form", { name: `Report ${name}` });
	await form.waitFor();
	await form.getByLabel(reasonLabel).check();
	await form.getByLabel("Version").selectOption(version ?? "");
	await form.getByLabel("Details").fill(details);
	if (shots) await shoot(page, shots, () => form.scrollIntoViewIfNeeded());
	await form.getByRole("button", { name: "Send report" }).click();
	const thanks = page.getByText("Thanks. Your report went to potli's admin.");
	await thanks.waitFor({ timeout: 15_000 });
	await page.close();
	return await thanks.count().catch(() => 1);
}

try {
	const userContext = await browser.newContext();
	const adminContext = await browser.newContext();
	const visitorContext = await browser.newContext();
	let publisher;
	let admin;

	await step(
		`sign in as ${VERIFY_LOGIN} and ${VERIFY_ADMIN_LOGIN}, a token each from /settings`,
		async () => {
			publisher = await signInWithToken(userContext, VERIFY_LOGIN);
			admin = await signInWithToken(adminContext, VERIFY_ADMIN_LOGIN);
			await admin.page.getByRole("link", { name: "Review reports" }).waitFor();
			await admin.page.screenshot({ path: join(out, "01-admin-settings.png"), fullPage: true });
			return "two tokens";
		},
	);
	if (!publisher || !admin) throw new Error("stopped: no tokens");

	const source = packageDir("mod", name);
	await step(`npm publish ${name} 1.0.0 and 1.0.1`, () => {
		for (const version of ["1.0.0", "1.0.1"]) {
			source.setVersion(version);
			const r = sh(`npm-publish-${version}`, `${publisher.npm} publish`, source.dir);
			must(r.status === 0, `npm publish ${version} failed: ${r.stderr.split("\n").slice(-3).join(" ")}`);
		}
		return "published";
	});

	const locked = consumer("consumer-bun-locked");
	await step("bun add it (latest 1.0.1) and it runs", () => {
		const r = sh("bun-add-before", `bun add ${name}`, locked, bunEnv("before"));
		must(r.status === 0, "bun add failed, see bun-add-before.log");
		const v = JSON.parse(
			readFileSync(join(locked, "node_modules", scope, base, "package.json"), "utf8"),
		).version;
		must(v === "1.0.1", `installed ${v}`);
		const ran = sh("bun-run-before", `node -e "console.log(require('${name}')('1h'))"`, locked);
		must(ran.stdout === "3600000", `ms('1h') printed ${ran.stdout}`);
		return `installed ${v}, ms('1h') = ${ran.stdout}`;
	});
	const npmLocked = consumer("consumer-npm-locked");
	await step("npm install 1.0.1 writes a package-lock that pins it", () => {
		const r = sh("npm-install-before", `npm install ${name}@1.0.1`, npmLocked);
		must(r.status === 0, "npm install failed, see npm-install-before.log");
		return JSON.parse(readFileSync(join(npmLocked, "package-lock.json"), "utf8")).packages[
			`node_modules/${name}`
		].resolved;
	});

	await step("a signed-out visitor reports 1.0.1 from the package page", () =>
		reportOnPage(visitorContext, {
			version: "1.0.1",
			reasonLabel: "Malware or harmful code",
			details: "Verify run: pretend 1.0.1 uploads ~/.npmrc in postinstall.",
			shots: "02-report-form",
		}),
	);

	await step("the admin sees it on /admin and takes 1.0.1 down", async () => {
		const page = admin.page;
		page.once("dialog", (dialog) => dialog.accept());
		await page.goto(`${origin}/admin`, { waitUntil: "networkidle" });
		const card = page.getByRole("article", { name: `Report about ${name}@1.0.1` });
		await card.waitFor();
		await shoot(page, "03-admin-open-report");
		await card.getByRole("button", { name: "Take down 1.0.1" }).click();
		await card.waitFor({ state: "detached", timeout: 15_000 });
		await page.getByRole("cell", { name: `${name}@1.0.1` }).waitFor();
		await shoot(page, "04-admin-resolved");
		return "taken down, report resolved";
	});

	await step("the packument hides 1.0.1 and latest is back on 1.0.0", async () => {
		const doc = await (await fetch(`${origin}/${scope}%2f${base}`)).json();
		writeFileSync(join(out, "packument-after-version-takedown.json"), JSON.stringify(doc, null, 2));
		must(JSON.stringify(Object.keys(doc.versions)) === '["1.0.0"]', `versions ${Object.keys(doc.versions)}`);
		must(doc["dist-tags"].latest === "1.0.0", `latest ${doc["dist-tags"].latest}`);
		return { versions: Object.keys(doc.versions), "dist-tags": doc["dist-tags"] };
	});

	await step("bun install from the lockfile that pins 1.0.1 fails and says why", () => {
		rmSync(join(locked, "node_modules"), { recursive: true, force: true });
		const r = sh("bun-install-locked-after", "bun install --frozen-lockfile", locked, bunEnv("after"));
		must(r.status !== 0, "bun install still succeeded");
		return errorLine(r, /410|taken down/i) ?? r.stderr.split("\n").slice(-3).join(" ");
	});
	await step("npm install from the package-lock that pins 1.0.1 fails and says why", () => {
		rmSync(join(npmLocked, "node_modules"), { recursive: true, force: true });
		const r = sh("npm-ci-locked-after", "npm ci --prefer-online --cache ./npm-cache", npmLocked);
		must(r.status !== 0, "npm ci still succeeded");
		const line = errorLine(r, /taken down/);
		must(line, "npm didn't print the takedown message, see npm-ci-locked-after.log");
		return line;
	});
	await step("npm install of 1.0.1 by name finds no such version", () => {
		const r = sh(
			"npm-install-pinned-after",
			`npm install ${name}@1.0.1 --prefer-online`,
			consumer("consumer-npm-pin"),
		);
		must(r.status !== 0, "npm install of 1.0.1 still succeeded");
		return errorLine(r, /notarget|No matching version/) ?? r.stderr.split("\n").slice(-2).join(" ");
	});
	await step("a fresh bun add gets 1.0.0, and it runs", () => {
		const dir = consumer("consumer-bun-fresh");
		const r = sh("bun-add-after", `bun add ${name}`, dir, bunEnv("fresh"));
		must(r.status === 0, "bun add failed, see bun-add-after.log");
		const v = JSON.parse(
			readFileSync(join(dir, "node_modules", scope, base, "package.json"), "utf8"),
		).version;
		must(v === "1.0.0", `installed ${v}`);
		const ran = sh("bun-run-after", `node -e "console.log(require('${name}')('1h'))"`, dir);
		must(ran.stdout === "3600000", `ms('1h') printed ${ran.stdout}`);
		return `installed ${v}, ms('1h') = ${ran.stdout}`;
	});
	await step("npm publish of 1.0.1 again is refused: a taken-down number is never reused", () => {
		source.setVersion("1.0.1");
		const r = sh("npm-republish-taken-down", `${publisher.npm} publish`, source.dir);
		must(r.status !== 0, "npm publish 1.0.1 succeeded");
		const line = errorLine(r, /409 Conflict/);
		must(
			line && /taken down/.test(line),
			`expected the 409 takedown message, see npm-republish-taken-down.log`,
		);
		return line;
	});

	await step("the Versions tab marks 1.0.1 taken down", async () => {
		const page = await newPage(visitorContext);
		await page.goto(`${origin}/package/${name}?tab=versions`, { waitUntil: "networkidle" });
		await page.getByText("taken down", { exact: true }).waitFor();
		await shoot(page, "05-versions-tab");
		await page.close();
		return "shown";
	});

	await step("a second report, and the admin takes the whole package down", async () => {
		await reportOnPage(visitorContext, {
			version: null,
			reasonLabel: "Spam or junk",
			details: "Verify run: the whole package.",
		});
		const page = admin.page;
		page.once("dialog", (dialog) => dialog.accept());
		await page.goto(`${origin}/admin`, { waitUntil: "networkidle" });
		const card = page.getByRole("article", { name: `Report about ${name}` });
		await card.getByRole("button", { name: "Take down the package" }).click();
		await card.waitFor({ state: "detached", timeout: 15_000 });
		return "taken down";
	});
	await step("npm install of the package fails with the takedown message", () => {
		const r = sh(
			"npm-install-package-after",
			`npm install ${name} --prefer-online`,
			consumer("consumer-npm-gone"),
		);
		must(r.status !== 0, "npm install still succeeded");
		const line = errorLine(r, /taken down/);
		must(line, "npm didn't print the takedown message, see npm-install-package-after.log");
		return line;
	});
	await step("bun add of the package fails", () => {
		const r = sh("bun-add-package-after", `bun add ${name}`, consumer("consumer-bun-gone"), bunEnv("gone"));
		must(r.status !== 0, "bun add still succeeded");
		return errorLine(r, /410|taken down|error/i) ?? r.stderr.split("\n").slice(-2).join(" ");
	});
	await step("the package page says it was taken down", async () => {
		const page = await newPage(visitorContext);
		await page.goto(`${origin}/package/${name}`, { waitUntil: "networkidle" });
		await page.getByRole("heading", { name: `${name} was taken down` }).waitFor();
		await shoot(page, "06-taken-down-page");
		await page.close();
		return "shown";
	});

	if (!process.argv.includes("--skip-burst")) {
		await step(`npm publish in a loop as ${VERIFY_ADMIN_LOGIN} until potli answers 429`, () => {
			const burst = packageDir("burst", `@${VERIFY_ADMIN_LOGIN}/burst-${base}`);
			for (let i = 0; i < 70; i++) {
				burst.setVersion(`1.0.${i}`);
				const r = sh(`npm-burst-${i}`, `${admin.npm} publish`, burst.dir);
				if (r.status === 0) continue;
				const line = errorLine(r, /429 Too Many Requests/);
				must(line, `publish ${i + 1} failed without a 429, see npm-burst-${i}.log`);
				return { refusedAt: i + 1, npmTookMs: r.ms, message: line };
			}
			throw new Error("70 publishes and no 429");
		});
	}

	await step("no errors in the browser console", () => {
		// The taken-down page is served as a 404, which Chrome logs for the document itself.
		const errors = consoleErrors.filter(
			(e) => !(e.startsWith(`${origin}/package/${name}:`) && e.includes("status of 404")),
		);
		must(errors.length === 0, errors.slice(0, 3).join(" | "));
		return "none";
	});
} catch (error) {
	steps.push({ step: "moderation", ok: false, error: redact(error?.message ?? error) });
	console.log(`FAIL ${redact(error?.message ?? error)}`);
} finally {
	await browser.close();
	rmSync(work, { recursive: true, force: true });
	const failed = steps.filter((s) => !s.ok);
	writeFileSync(
		join(out, "moderation.json"),
		JSON.stringify({ run, origin, package: name, ok: failed.length === 0, steps }, null, 2),
	);
	console.log(
		`${failed.length ? `moderation: ${failed.length} of ${steps.length} steps FAILED` : `moderation: all ${steps.length} steps passed`}. Evidence: ${join(".artifacts", "verify", run)}`,
	);
	process.exitCode = failed.length ? 1 : 0;
}

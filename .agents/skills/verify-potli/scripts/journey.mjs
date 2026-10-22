// The publish journey a user takes, driven for real against this checkout's dev server:
//   seed -> dev sign-in on /sign-in -> create a token on /settings -> npm whoami -> npm publish a
//   real tarball (ms from npmjs, renamed into @potli-verify) -> republish is refused -> packument and
//   tarball bytes -> npm install and bun add in scratch projects, then run the package -> package
//   page and a seeded package page, screenshotted.
//
//   node .agents/skills/verify-potli/scripts/dev.mjs start
//   node .agents/skills/verify-potli/scripts/journey.mjs
//
// Evidence goes to .artifacts/verify/<run>/: journey.json (every step, pass or fail, with what was
// seen), *.png, and the npm/bun output. The token is replaced with <REDACTED> in all of it and
// masked in screenshots. Exit 0 only when every step passed.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { findBrowser } from "./browser.mjs";
import { origin, port, VERIFY_LOGIN } from "./dev.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..", "..");
const run = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = join(root, ".artifacts", "verify", run);
const work = join(root, ".wrangler", "verify", "work", run);
mkdirSync(out, { recursive: true });
mkdirSync(work, { recursive: true });

const scope = `@${VERIFY_LOGIN}`;
const name = `${scope}/ms`;
// A fresh version each run, because published versions never change.
const version = `2.1.${Math.floor(Date.now() / 1000)}`;
let token = "";
const redact = (text) => (token ? String(text).replaceAll(token, "<REDACTED>") : String(text));
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
	const r = spawnSync(command, { cwd, env, shell: true, encoding: "utf8", timeout: 180_000 });
	const text = `$ ${command}\n${r.stdout ?? ""}${r.stderr ?? ""}\n[exit ${r.status}]\n`;
	writeFileSync(join(out, `${label}.log`), redact(text));
	return { status: r.status, stdout: (r.stdout ?? "").trim(), stderr: (r.stderr ?? "").trim() };
};
const must = (cond, message) => {
	if (!cond) throw new Error(message);
};

if (!port) throw new Error("no PORT in .env.local: run bun run setup");
const executablePath = findBrowser();
if (!executablePath) throw new Error("no browser: install Chrome or Chromium, or set POTLI_BROWSER");
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));

try {
	const seeded = await step("seed local D1 (bun run seed)", () => {
		const r = sh("seed", "bun run seed", root);
		must(r.status === 0, `seed failed, see seed.log: ${r.stderr.split("\n").slice(-2).join(" ")}`);
		return r.stdout.split("\n").at(-1);
	});

	await step(`dev sign-in as ${VERIFY_LOGIN} on /sign-in`, async () => {
		// networkidle: clicking before React hydrates submits the form as a plain GET to /sign-in?login=.
		await page.goto(`${origin}/sign-in`, { waitUntil: "networkidle" });
		await page.getByLabel("GitHub login").fill(VERIFY_LOGIN);
		await page.getByRole("button", { name: "Sign in", exact: true }).click();
		await page.waitForURL(`${origin}/settings`, { timeout: 30_000 });
		await page.getByRole("heading", { name: "Publish tokens" }).waitFor();
		await page.screenshot({ path: join(out, "01-settings-signed-in.png"), fullPage: true });
		return page.url();
	});

	await step("create a publish token on /settings", async () => {
		const tokenName = `verify-${run.slice(11)}`;
		await page.getByLabel("Token name").fill(tokenName);
		await page.getByRole("button", { name: "Create token" }).click();
		const shown = page.getByRole("region", { name: `Copy “${tokenName}” now` });
		await shown.waitFor({ timeout: 30_000 });
		token = (await shown.locator(".font-mono").first().innerText()).trim();
		must(token.length >= 20, "no token text in the created-token panel");
		// The panel takes focus and scrolls; a full-page shot from mid-page draws the sticky header over it.
		await page.evaluate(() => window.scrollTo(0, 0));
		await page.screenshot({
			path: join(out, "02-token-created.png"),
			fullPage: true,
			mask: [shown.locator(".font-mono"), shown.locator("pre")],
		});
		return { tokenName, tokenLength: token.length };
	});
	if (!token) throw new Error("stopped: no token, so the steps after it can't run");

	const npmrc = join(work, ".npmrc");
	writeFileSync(npmrc, `${scope}:registry=${origin}/\n//localhost:${port}/:_authToken=${token}\n`);
	const npm = `npm --userconfig "${npmrc}"`;

	await step("npm whoami with the token", () => {
		const r = sh("npm-whoami", `${npm} whoami --registry ${origin}/`, work);
		must(
			r.status === 0 && r.stdout === VERIFY_LOGIN,
			`expected ${VERIFY_LOGIN}, got ${r.stdout || r.stderr}`,
		);
		return r.stdout;
	});

	const tarball = await step(`npm pack a real package (ms from npmjs) as ${name}@${version}`, () => {
		let r = sh("npm-pack-source", "npm pack ms@2.1.3 --registry https://registry.npmjs.org/", work);
		must(r.status === 0, "couldn't download ms@2.1.3 from npmjs");
		r = sh("untar", "tar -xzf ms-2.1.3.tgz", work);
		must(r.status === 0, "couldn't unpack ms-2.1.3.tgz");
		const pkgPath = join(work, "package", "package.json");
		const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
		writeFileSync(pkgPath, `${JSON.stringify({ ...pkg, name, version }, null, 2)}\n`);
		r = sh("npm-pack", "npm pack --pack-destination ..", join(work, "package"));
		must(r.status === 0, "npm pack failed");
		const file = join(work, r.stdout.split("\n").at(-1));
		const bytes = readFileSync(file);
		return { file, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
	});

	await step("npm publish the tarball", () => {
		must(tarball, "no tarball");
		const r = sh("npm-publish", `${npm} publish "${tarball.file}"`, work);
		must(r.status === 0, `npm publish failed: ${r.stderr.split("\n").slice(-3).join(" ")}`);
		return r.stdout.split("\n").at(-1);
	});

	await step("publishing the same version again is refused", () => {
		const r = sh("npm-republish", `${npm} publish "${tarball.file}"`, work);
		must(r.status !== 0 && /E409/.test(r.stderr), `expected a 409, got exit ${r.status}`);
		return r.stderr.split("\n").find((l) => l.includes("409 Conflict")) ?? "refused";
	});

	await step("packument lists the version, tarball URL uses this origin, bytes match", async () => {
		const res = await fetch(`${origin}/${scope}%2fms`);
		must(res.status === 200, `packument status ${res.status}`);
		const doc = await res.json();
		writeFileSync(join(out, "packument.json"), JSON.stringify(doc, null, 2));
		const manifest = doc.versions?.[version];
		must(manifest, `version ${version} missing from packument`);
		must(doc["dist-tags"]?.latest === version, `latest is ${doc["dist-tags"]?.latest}`);
		must(manifest.dist.tarball.startsWith(`${origin}/`), `tarball URL ${manifest.dist.tarball}`);
		const served = Buffer.from(await (await fetch(manifest.dist.tarball)).arrayBuffer());
		const sha256 = createHash("sha256").update(served).digest("hex");
		must(sha256 === tarball.sha256, `served tarball sha256 ${sha256} != packed ${tarball.sha256}`);
		return { latest: doc["dist-tags"].latest, tarball: manifest.dist.tarball, sha256 };
	});

	for (const client of ["npm", "bun"]) {
		await step(`${client} installs it in a scratch project and it runs`, () => {
			const dir = join(work, `consumer-${client}`);
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, "package.json"), '{ "name": "consumer", "private": true }\n');
			writeFileSync(join(dir, ".npmrc"), `${scope}:registry=${origin}/\n`);
			const install = client === "npm" ? `npm install ${name}@${version}` : `bun add ${name}@${version}`;
			// bun reuses a packument it cached in an earlier run and ignores Cache-Control, so a version
			// published since then "doesn't exist" for it. Its own cache folder per run avoids that.
			const env = { ...process.env, BUN_INSTALL_CACHE_DIR: join(work, "bun-cache") };
			const r = sh(`${client}-install`, install, dir, env);
			must(r.status === 0, `${install} failed, see ${client}-install.log`);
			const installed = JSON.parse(
				readFileSync(join(dir, "node_modules", scope, "ms", "package.json"), "utf8"),
			);
			must(installed.version === version, `installed ${installed.version}`);
			const ran = sh(`${client}-run`, `node -e "console.log(require('${name}')('1h'))"`, dir);
			must(ran.stdout === "3600000", `ms('1h') printed ${ran.stdout || ran.stderr}`);
			return `${installed.name}@${installed.version}, ms('1h') = ${ran.stdout}`;
		});
	}

	await step(`package page /package/${name} shows the version`, async () => {
		const res = await page.goto(`${origin}/package/${name}`, { waitUntil: "networkidle" });
		must(res?.status() === 200, `status ${res?.status()}`);
		await page.getByText(version).first().waitFor({ timeout: 15_000 });
		await page.screenshot({ path: join(out, "03-package-page.png"), fullPage: true });
		return await page.title();
	});

	if (seeded) {
		await step("seeded package page /package/@kausthubh/critly renders its README", async () => {
			const res = await page.goto(`${origin}/package/@kausthubh/critly`, { waitUntil: "networkidle" });
			must(res?.status() === 200, `status ${res?.status()}`);
			await page.getByRole("heading", { level: 1 }).first().waitFor();
			await page.screenshot({ path: join(out, "04-seeded-package-page.png"), fullPage: true });
			return await page.title();
		});
	}

	await step("no errors in the browser console", () => {
		must(consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
		return "none";
	});
} catch (error) {
	steps.push({ step: "journey", ok: false, error: redact(error?.message ?? error) });
	console.log(`FAIL ${redact(error?.message ?? error)}`);
} finally {
	await browser.close();
	// The token lives only in this scratch folder; the evidence keeps the redacted logs.
	rmSync(work, { recursive: true, force: true });
	const failed = steps.filter((s) => !s.ok);
	writeFileSync(
		join(out, "journey.json"),
		JSON.stringify({ run, origin, package: `${name}@${version}`, ok: failed.length === 0, steps }, null, 2),
	);
	console.log(
		`${failed.length ? `journey: ${failed.length} of ${steps.length} steps FAILED` : `journey: all ${steps.length} steps passed`}. Evidence: ${join(".artifacts", "verify", run)}`,
	);
	process.exitCode = failed.length ? 1 : 0;
}

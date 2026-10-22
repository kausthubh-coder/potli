// Make this checkout ready to run, isolated from other worktrees. Safe to rerun.
// - installs deps when node_modules is missing or older than bun.lock
// - copies .dev.vars and .env.local from the main checkout (or creates them from the examples)
// - claims a dev port no other worktree uses and writes it to PORT and BETTER_AUTH_URL
// - applies D1 migrations to this checkout's own local database (.wrangler/state)
// - links .claude/skills to .agents/skills
// Then runs the doctor.
import { execSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sh = (cmd) => execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
const run = (cmd) => {
	const r = spawnSync(cmd, { cwd: root, stdio: "inherit", shell: true });
	if (r.status !== 0) process.exit(r.status ?? 1);
};
const notes = [];

// 1. Dependencies
const lock = join(root, "bun.lock");
const modules = join(root, "node_modules");
if (!existsSync(modules) || statSync(modules).mtimeMs < statSync(lock).mtimeMs) {
	run("bun install");
	notes.push("installed deps");
}

// 2. Env files
const mainCheckout = dirname(resolve(root, sh("git rev-parse --git-common-dir")));
for (const file of [".dev.vars", ".env.local"]) {
	const target = join(root, file);
	if (existsSync(target)) continue;
	const fromMain = join(mainCheckout, file);
	if (mainCheckout !== root && existsSync(fromMain)) {
		copyFileSync(fromMain, target);
		notes.push(`copied ${file} from main checkout`);
	} else if (file === ".dev.vars") {
		const example = readFileSync(join(root, ".dev.vars.example"), "utf8")
			.split("\n")
			.map((line) => line.replace(/\s+#.*$/, ""))
			.join("\n")
			.replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64url")}`);
		writeFileSync(target, example);
		notes.push("created .dev.vars (add GitHub OAuth keys to sign in)");
	} else {
		writeFileSync(target, "PORT=3000\nVITE_POSTHOG_KEY=\n");
	}
}
if (/(potli\.|workers\.dev|kausthubh\.dev)/.test(readFileSync(join(root, ".dev.vars"), "utf8"))) {
	console.error(".dev.vars names a production URL. Dev env must point at localhost.");
	process.exit(1);
}

// 3. Port: hash of this path, skipping ports other worktrees claimed or something listens on
const claimed = new Set();
for (const line of sh("git worktree list --porcelain").split("\n")) {
	if (!line.startsWith("worktree ")) continue;
	const dir = line.slice("worktree ".length);
	if (resolve(dir) === root) continue;
	const env = join(dir, ".env.local");
	const port = existsSync(env) && readFileSync(env, "utf8").match(/^PORT=(\d+)/m)?.[1];
	if (port) claimed.add(Number(port));
}
const listening = (port, host) =>
	new Promise((ok) => {
		const s = createConnection({ port, host });
		s.once("connect", () => {
			s.destroy();
			ok(true);
		});
		s.once("error", () => ok(false));
	});
const envLocal = join(root, ".env.local");
let port = Number(readFileSync(envLocal, "utf8").match(/^PORT=(\d+)/m)?.[1] ?? 0);
const isMain = mainCheckout === root;
if (!port || (!isMain && port === 3000) || claimed.has(port)) {
	let hash = 0;
	for (const ch of root.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
	port = isMain ? 3000 : 3100 + (hash % 800);
	while (claimed.has(port) || (await listening(port, "127.0.0.1")) || (await listening(port, "::1"))) port++;
	notes.push(`claimed port ${port}`);
}
const setVar = (file, key, value) => {
	const path = join(root, file);
	const text = readFileSync(path, "utf8");
	const re = new RegExp(`^${key}=.*$`, "m");
	writeFileSync(
		path,
		re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`,
	);
};
setVar(".env.local", "PORT", port);
setVar(".dev.vars", "BETTER_AUTH_URL", `http://localhost:${port}`);

// 4. This checkout's own local D1
execSync("bunx wrangler d1 migrations apply DB --local", { cwd: root, stdio: "ignore" });

// 5. Skills link for Claude Code
const link = join(root, ".claude", "skills");
if (!existsSync(link) && existsSync(join(root, ".agents", "skills"))) {
	execSync(
		`mkdir "${join(root, ".claude")}" 2>nul & mklink /J "${link}" "${join(root, ".agents", "skills")}"`,
		{
			shell: "cmd.exe",
			stdio: "ignore",
		},
	);
	notes.push("linked .claude/skills");
}

run("node scripts/doctor.mjs");
console.log(`setup: ready on http://localhost:${port}${notes.length ? ` (${notes.join(", ")})` : ""}`);

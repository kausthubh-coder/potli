// Read-only health check for this checkout. Run it before trusting a failure.
// Prints one line per check and the command that fixes each problem.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createConnection } from "node:net";
import { join, resolve } from "node:path";
import { pendingMigrations } from "./local-d1.mjs";

const root = resolve(import.meta.dirname, "..");
const sh = (cmd) => {
	try {
		return execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
	} catch (e) {
		return `ERROR ${e.stdout ?? ""}${e.stderr ?? ""}`;
	}
};
let failed = 0;
const check = (ok, label, fix) => {
	console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `  ->  ${fix}`}`);
	if (!ok) failed++;
};
const warn = (label) => console.log(`warn ${label}`);
const read = (file) => (existsSync(join(root, file)) ? readFileSync(join(root, file), "utf8") : "");
const get = (text, key) => text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? "";

const modules = join(root, "node_modules");
check(
	existsSync(modules) && statSync(modules).mtimeMs >= statSync(join(root, "bun.lock")).mtimeMs,
	"deps installed and current with bun.lock",
	"bun install",
);

const vars = read(".dev.vars");
const envLocal = read(".env.local");
check(vars !== "" && envLocal !== "", ".dev.vars and .env.local exist", "bun run setup");
check(get(vars, "BETTER_AUTH_SECRET").length >= 32, "BETTER_AUTH_SECRET set", "bun run setup");
const port = get(envLocal, "PORT");
check(
	get(vars, "BETTER_AUTH_URL") === `http://localhost:${port}`,
	`BETTER_AUTH_URL matches PORT ${port}`,
	"bun run setup",
);
// Two setups started at the same moment can both pick a port before either writes it down.
const sharing = sh("git worktree list --porcelain")
	.split("\n")
	.filter((line) => line.startsWith("worktree "))
	.map((line) => resolve(line.slice("worktree ".length)))
	.filter((dir) => {
		const env = join(dir, ".env.local");
		return dir !== root && existsSync(env) && get(readFileSync(env, "utf8"), "PORT") === port;
	});
check(
	sharing.length === 0,
	`PORT ${port} is not claimed by another worktree${sharing.length ? ` (${sharing.join(", ")} has it)` : ""}`,
	"bun run setup",
);
check(
	!/(potli\.|workers\.dev|kausthubh\.dev)/.test(vars),
	"dev env points at localhost, not production",
	"fix .dev.vars",
);
if (!get(vars, "GITHUB_CLIENT_ID") || !get(vars, "GITHUB_CLIENT_SECRET")) {
	warn("GitHub OAuth keys missing in .dev.vars: sign-in won't work (registry and pages still do)");
}

const pending = await pendingMigrations(root);
check(
	pending
		? pending.length === 0
		: /No migrations to apply/i.test(sh("bunx wrangler d1 migrations list DB --local")),
	`local D1 has every migration${pending?.length ? ` (missing ${pending.join(", ")})` : ""}`,
	"bun run db:migrate",
);

const link = join(root, ".claude", "skills");
check(
	existsSync(link) && realpathSync(link) === realpathSync(join(root, ".agents", "skills")),
	".claude/skills links to .agents/skills",
	"bun run setup",
);

const listening = await new Promise((ok) => {
	const s = createConnection({ port: Number(port), host: "127.0.0.1" });
	s.once("connect", () => {
		s.destroy();
		ok(true);
	});
	s.once("error", () => ok(false));
});
console.log(`info port ${port} ${listening ? "has a server (yours, if you started dev here)" : "is free"}`);

const behind = sh("git rev-list --count HEAD..origin/main");
if (/^\d+$/.test(behind)) {
	if (Number(behind) > 0) warn(`${behind} commits behind origin/main`);
} else {
	console.log("info no origin/main to compare against");
}

process.exit(failed ? 1 : 0);

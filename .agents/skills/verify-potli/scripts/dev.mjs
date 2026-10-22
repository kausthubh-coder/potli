// Starts, checks and stops this checkout's dev server for verification.
//
//   node .agents/skills/verify-potli/scripts/dev.mjs start    # starts dev, waits until pages render
//   node .agents/skills/verify-potli/scripts/dev.mjs status   # read-only doctor; exit 0 = worth driving
//   node .agents/skills/verify-potli/scripts/dev.mjs stop     # stops the tree start made, nothing else
//
// start runs `bun run dev` in its own process group (Linux, macOS) or as a detached tree (Windows)
// and writes its PID to .wrangler/verify/dev.pid, so stop ends vite and workerd with it. It also
// makes sure .dev.vars turns dev sign-in on and lets the verify login sign up, because the journey
// signs in as that login. Both are local-only settings; setup copies .dev.vars per checkout.
import { execSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const VERIFY_LOGIN = "potli-verify";
const root = resolve(import.meta.dirname, "..", "..", "..", "..");
const dir = join(root, ".wrangler", "verify");
const pidFile = join(dir, "dev.pid");
const logFile = join(dir, "dev.log");
const read = (file) => (existsSync(join(root, file)) ? readFileSync(join(root, file), "utf8") : "");
const get = (text, key) =>
	text
		.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]
		?.replace(/\s+#.*$/, "")
		.trim() ?? "";
export const port = Number(get(read(".env.local"), "PORT") || 0);
export const origin = `http://localhost:${port}`;

const alive = (pid) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};
const savedPid = () => (existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8")) : 0);
const fetchText = async (path) => {
	try {
		const res = await fetch(`${origin}${path}`, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
		return { status: res.status, text: await res.text() };
	} catch (error) {
		return { status: 0, text: String(error) };
	}
};

function ensureDevVars() {
	const path = join(root, ".dev.vars");
	let text = read(".dev.vars");
	if (!text) throw new Error(".dev.vars is missing: run `bun run setup` first");
	const changes = [];
	const set = (key, value) => {
		const re = new RegExp(`^${key}=.*$`, "m");
		text = re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
		changes.push(`${key}=${value}`);
	};
	if (get(text, "DEV_LOGIN") !== "1") set("DEV_LOGIN", "1");
	const allow = get(text, "SIGNUP_ALLOWLIST")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (!allow.includes(VERIFY_LOGIN)) set("SIGNUP_ALLOWLIST", [...allow, VERIFY_LOGIN].join(","));
	if (changes.length) {
		writeFileSync(path, text);
		console.log(`dev: set ${changes.join(" and ")} in .dev.vars`);
	}
	return changes.length > 0;
}

async function status() {
	const checks = [];
	const check = (ok, label, fix) => {
		checks.push(ok);
		console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `  ->  ${fix}`}`);
	};
	const pid = savedPid();
	check(port > 0, `PORT ${port} in .env.local`, "bun run setup");
	check(
		pid > 0 && alive(pid),
		`dev server PID ${pid || "(none)"} from dev.mjs start is running`,
		"dev.mjs start",
	);
	const ping = await fetchText("/-/ping");
	check(
		ping.status === 200,
		`registry answers on ${origin}/-/ping (${ping.status})`,
		"dev.mjs stop, then dev.mjs start",
	);
	const home = await fetchText("/");
	check(
		home.status === 200 && !home.text.includes("Switched to client rendering"),
		`home page renders on the server (${home.status})`,
		"read .wrangler/verify/dev.log; restart with dev.mjs stop && dev.mjs start",
	);
	const signIn = await fetchText("/sign-in");
	check(
		signIn.text.includes("Dev sign-in"),
		"dev sign-in is on",
		"dev.mjs stop && dev.mjs start (it sets DEV_LOGIN=1)",
	);
	const vars = read(".dev.vars");
	check(
		get(vars, "SIGNUP_ALLOWLIST")
			.split(",")
			.map((s) => s.trim())
			.includes(VERIFY_LOGIN),
		`${VERIFY_LOGIN} is on SIGNUP_ALLOWLIST`,
		"dev.mjs stop && dev.mjs start (it adds it)",
	);
	return checks.every(Boolean);
}

async function start() {
	const changed = ensureDevVars();
	const pid = savedPid();
	if (pid && alive(pid)) {
		if (!changed) {
			console.log(`dev: already running (PID ${pid}) on ${origin}`);
			return true;
		}
		console.log("dev: .dev.vars changed, restarting");
		stop();
	}
	mkdirSync(dir, { recursive: true });
	const log = openSync(logFile, "w");
	// detached: its own process group on Linux and macOS, so stop() can signal the whole group.
	const child = spawn("bun", ["run", "dev"], {
		cwd: root,
		detached: true,
		stdio: ["ignore", log, log],
		windowsHide: true,
		shell: process.platform === "win32",
	});
	closeSync(log);
	child.unref();
	writeFileSync(pidFile, String(child.pid));
	console.log(`dev: started PID ${child.pid}, log in .wrangler/verify/dev.log`);
	const started = Date.now();
	// The first start in a checkout optimizes dependencies for about a minute on Windows.
	while (Date.now() - started < 180_000) {
		if (!alive(child.pid)) break;
		if (readFileSync(logFile, "utf8").includes("Local:")) {
			const home = await fetchText("/");
			if (home.status === 200) {
				console.log(`dev: ready on ${origin} after ${Math.round((Date.now() - started) / 1000)}s`);
				return status();
			}
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	console.error(
		`dev: not ready. Last lines of .wrangler/verify/dev.log:\n${readFileSync(logFile, "utf8").split("\n").slice(-15).join("\n")}`,
	);
	return false;
}

function stop() {
	const pid = savedPid();
	if (!pid || !alive(pid)) {
		console.log("dev: nothing to stop");
		rmSync(pidFile, { force: true });
		return true;
	}
	if (process.platform === "win32") execSync(`taskkill /T /F /PID ${pid}`, { stdio: "ignore" });
	else process.kill(-pid, "SIGTERM");
	for (let i = 0; i < 50 && alive(pid); i++)
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
	rmSync(pidFile, { force: true });
	console.log(`dev: stopped PID ${pid} and its children`);
	return true;
}

const command = process.argv[2];
if (import.meta.filename === resolve(process.argv[1] ?? "")) {
	const ok =
		command === "start"
			? await start()
			: command === "stop"
				? stop()
				: command === "status"
					? await status()
					: null;
	if (ok === null) {
		console.error("usage: node .agents/skills/verify-potli/scripts/dev.mjs start|status|stop");
		process.exit(2);
	}
	process.exit(ok ? 0 : 1);
}

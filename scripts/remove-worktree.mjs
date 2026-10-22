// Remove a worktree of this repo cleanly: `bun run remove-worktree <path> [--force]`.
// Run it from another checkout. In order:
// 1. stops the checkout's dev process trees (anything running from <path>/node_modules: vite, workerd)
// 2. deletes the .claude/skills link itself, never what it points to
// 3. `git worktree remove`, which on Windows otherwise trips over the junction and leaves the folder
// --force also removes a worktree with uncommitted changes. The branch stays; ship-potli deletes it.
import { execFileSync, execSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const args = process.argv.slice(2);
const force = args.includes("--force");
const target = args.find((a) => !a.startsWith("--"));
const fail = (message) => {
	console.error(`remove-worktree: ${message}`);
	process.exit(1);
};
if (!target) fail("usage: bun run remove-worktree <path> [--force]");

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
// Windows paths are case-insensitive and may use either slash; Linux paths are neither.
const fold = (p) => (process.platform === "win32" ? p.toLowerCase().replaceAll("/", "\\") : p);
const same = (a, b) => fold(resolve(a)) === fold(resolve(b));
const dir = resolve(target);

// Only a linked worktree of this repo, never the main checkout or the one we stand in.
const worktrees = git("worktree", "list", "--porcelain")
	.split(/\n\n+/)
	.map((block) => ({
		path: block.match(/^worktree (.+)$/m)?.[1] ?? "",
		branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? "(detached)",
	}));
const entry = worktrees.find((w) => same(w.path, dir));
if (!entry) fail(`${dir} is not a worktree of this repo (see git worktree list)`);
if (entry === worktrees[0]) fail(`${dir} is the main checkout`);
if (fold(`${resolve(process.cwd())}${sep}`).startsWith(fold(`${dir}${sep}`))) {
	fail("run this from another checkout, not from inside the worktree you are removing");
}
const dirty = existsSync(dir) ? git("-C", dir, "status", "--porcelain") : "";
if (dirty && !force)
	fail(`${dir} has uncommitted changes:\n${dirty}\nCommit them, or pass --force to drop them.`);

// 1. Stop dev process trees started in this checkout. Matching on <path>/node_modules finds vite and
// workerd but not an editor or shell that merely has the folder open.
const processes =
	process.platform === "win32"
		? JSON.parse(
				execSync(
					'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress"',
					{ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
				),
			).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, cmd: p.CommandLine ?? "" }))
		: execSync("ps -eo pid=,ppid=,args=", { encoding: "utf8" })
				.split("\n")
				.filter(Boolean)
				.map((line) => {
					const [, pid, ppid, cmd] = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/) ?? [];
					return { pid: Number(pid), ppid: Number(ppid), cmd: cmd ?? "" };
				});
const ancestors = new Set();
for (let pid = process.pid; pid && !ancestors.has(pid); pid = processes.find((p) => p.pid === pid)?.ppid) {
	ancestors.add(pid);
}
const marker = fold(join(dir, "node_modules"));
const fromHere = (p) => !ancestors.has(p.pid) && fold(p.cmd).includes(marker);
const matching = processes.filter(fromHere);
const roots = matching.filter((p) => !matching.some((q) => q.pid === p.ppid));
if (roots.length === 0) console.log("no dev processes running from this checkout");
for (const p of roots) console.log(`stopping PID ${p.pid} and its children: ${p.cmd.slice(0, 120)}`);
// taskkill /T takes each tree on Windows. Elsewhere each root and everything under it gets its own
// signal, including children whose command line doesn't name the checkout.
const trees = [...roots];
for (const p of trees) {
	for (const child of processes) if (child.ppid === p.pid && !trees.includes(child)) trees.push(child);
}
for (const p of process.platform === "win32" ? roots : trees) {
	try {
		if (process.platform === "win32") execSync(`taskkill /T /F /PID ${p.pid}`, { stdio: "ignore" });
		else process.kill(p.pid, "SIGTERM");
	} catch {
		// Already gone with its parent.
	}
}

// 2. The skills link. rmdir (Windows) and unlink (elsewhere) remove the link only; neither can
// delete the files it points to.
const link = join(dir, ".claude", "skills");
if (lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) {
	if (process.platform === "win32") rmdirSync(link);
	else unlinkSync(link);
	console.log("removed the .claude/skills link");
}
const claude = join(dir, ".claude");
if (existsSync(claude) && readdirSync(claude).length === 0) rmdirSync(claude);

// 3. The worktree. Killed processes can hold files for a moment after taskkill returns, so retry.
// Deleting node_modules makes this take about a minute on Windows.
let removed = false;
for (let attempt = 1; attempt <= 5 && !removed; attempt++) {
	try {
		execFileSync("git", ["worktree", "remove", ...(force ? ["--force"] : []), dir], { stdio: "pipe" });
		removed = true;
	} catch (e) {
		if (attempt === 5) fail(`git worktree remove failed: ${String(e.stderr ?? e.message).trim()}`);
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
	}
}
if (existsSync(dir)) {
	fail(`git removed the worktree but ${dir} is still on disk: ${readdirSync(dir).join(", ")}`);
}
console.log(`remove-worktree: removed ${dir} (branch ${entry.branch} kept)`);

// Makes a cloud session (Claude Code on the web, Codex Cloud) ready by itself. A cloud VM starts
// from a bare Linux clone: no global skills, no deps, no .dev.vars, no .claude/skills link.
//
//   Claude: the SessionStart hook in .claude/settings.json runs `node scripts/cloud.mjs`
//   Codex:  the environment's setup script is `CLOUD=1 node scripts/cloud.mjs`
//
// Local sessions don't set CLAUDE_CODE_REMOTE, CODEX_CI or CLOUD, so it exits at once there. That
// matters: session.sh rewrites ~/.claude/CLAUDE.md. stdout becomes the session's context, so only
// the rules and the last line go there; setup's output goes to stderr.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

if (process.env.CLAUDE_CODE_REMOTE !== "true" && !process.env.CODEX_CI && process.env.CLOUD !== "1")
	process.exit(0);

const root = resolve(import.meta.dirname, "..");
const problems = [];
const run = (command, stdout) =>
	spawnSync(command, { cwd: root, shell: true, stdio: ["ignore", stdout, "inherit"] }).status === 0;

// 1. My global skills and rules. Its stdout (the rules) passes through to the session.
if (
	!run(
		"curl -fsSL https://raw.githubusercontent.com/kausthubh-coder/skills/main/cloud/session.sh | bash",
		"inherit",
	)
)
	problems.push("the global skills and rules didn't load");

// 2. Setup: deps, .dev.vars from the example, port, this clone's local D1, skills link, then the
// doctor. Its output goes to stderr.
if (!run("node scripts/setup.mjs", process.stderr))
	problems.push("setup or the doctor failed (run bun run doctor)");

console.log(
	problems.length
		? `cloud: potli NOT ready: ${problems.join("; ")}.`
		: "cloud: potli ready (deps, port, local D1, skills). See ## Cloud sessions in AGENTS.md.",
);

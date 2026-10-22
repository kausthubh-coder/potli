// Fill this checkout's local D1 with real-shaped data for working on the website: one user,
// the scopes @kausthubh and @kriyan, three packages built from real package.json files and
// READMEs, several versions each with dist-tags, and twelve weeks of daily download counts.
// Local only: it never passes --remote. Safe to rerun; it replaces the rows in those two scopes.
// No R2 objects are written, so tarball downloads of seeded versions 404.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
// The other repos sit next to the main checkout (dev/potli, dev/critly, ...), on the laptop and on
// the cloud machine alike. A worktree finds that folder through git's common dir.
const mainCheckout = dirname(
	resolve(root, execSync("git rev-parse --git-common-dir", { cwd: root, encoding: "utf8" }).trim()),
);
const dev = resolve(root, process.env.POTLI_SEED_SOURCES ?? dirname(mainCheckout));
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

// Each package: where its real files are, the scoped name it gets here, and its release history
// (days before today). The last non-prerelease version is `latest`.
const sources = [
	{
		dir: "critly/packages/critly",
		name: "@kausthubh/critly",
		releases: [
			["0.1.0", 74],
			["0.1.1", 66],
			["0.1.2", 51],
			["0.2.0", 30],
			["0.2.1", 12],
			["0.3.0-beta.1", 3, "next"],
		],
		baseSize: 41_200,
		daily: 64,
	},
	{
		dir: "megha/packages/megha",
		name: "@kausthubh/megha",
		releases: [
			["0.0.1", 40],
			["0.1.0", 19],
			["0.1.1", 6],
		],
		baseSize: 27_900,
		daily: 23,
	},
	{
		dir: "kriyan/packages/cli",
		name: "@kriyan/cli",
		releases: [
			["0.1.0", 9],
			["0.1.1", 1],
		],
		baseSize: 18_400,
		daily: 9,
		// The real package.json is a private workspace package; give it what a publish would have.
		patch: (pkg) => {
			const { private: _private, devDependencies: _dev, ...rest } = pkg;
			return { ...rest, bin: { kriyan: "dist/kriyan.js" }, license: "MIT", engines: { node: ">=20" } };
		},
	},
];

const q = (value) => {
	if (value === null || value === undefined) return "NULL";
	if (typeof value === "number") return String(Math.round(value));
	return `'${String(value).replaceAll("'", "''")}'`;
};

// Deterministic pseudo-random numbers, so every seed gives the same chart.
let state = 20261022;
const random = () => {
	state = (state * 1664525 + 1013904223) >>> 0;
	return state / 2 ** 32;
};

const sql = [];
const ownerId = "(SELECT id FROM user WHERE username = 'kausthubh')";
const scopes = ["kausthubh", "kriyan"];
const scopeList = scopes.map(q).join(", ");
const inScopes = `(SELECT name FROM packages WHERE scope IN (${scopeList}))`;

sql.push(
	`DELETE FROM downloads WHERE package_name IN ${inScopes};`,
	`DELETE FROM dist_tags WHERE package_name IN ${inScopes};`,
	`DELETE FROM versions WHERE package_name IN ${inScopes};`,
	`DELETE FROM packages WHERE scope IN (${scopeList});`,
	`DELETE FROM scopes WHERE name IN (${scopeList});`,
	// Keeps a real user who signed in locally as kausthubh; otherwise adds a seed user.
	`INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at, username) VALUES ('seed-user-kausthubh', 'Kausthubh', 'kausthubh@users.noreply.potli.dev', 1, 'https://avatars.githubusercontent.com/kausthubh-coder', ${now - 90 * DAY}, ${now - 90 * DAY}, 'kausthubh') ON CONFLICT DO NOTHING;`,
	`INSERT INTO scopes (name, owner_id, kind, created_at) VALUES ('kausthubh', ${ownerId}, 'user', ${now - 90 * DAY});`,
	`INSERT INTO scopes (name, owner_id, kind, created_at) VALUES ('kriyan', ${ownerId}, 'org', ${now - 20 * DAY});`,
);

const today = new Date(now);
const dayKey = (offset) =>
	new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - offset * DAY)
		.toISOString()
		.slice(0, 10);

for (const source of sources) {
	const dir = join(dev, source.dir);
	const pkgPath = join(dir, "package.json");
	if (!existsSync(pkgPath)) {
		console.error(
			`seed: ${pkgPath} not found. Set POTLI_SEED_SOURCES to the folder that holds critly, megha and kriyan.`,
		);
		process.exit(1);
	}
	const raw = JSON.parse(readFileSync(pkgPath, "utf8"));
	const pkg = source.patch ? source.patch(raw) : raw;
	const readme = readFileSync(join(dir, "README.md"), "utf8");
	const scope = source.name.slice(1, source.name.indexOf("/"));
	const shortName = source.name.slice(source.name.indexOf("/") + 1);

	const first = now - source.releases[0][1] * DAY;
	const last = now - source.releases.at(-1)[1] * DAY;
	sql.push(
		`INSERT INTO packages (name, scope, description, readme, created_at, updated_at) VALUES (${q(source.name)}, ${q(scope)}, ${q(pkg.description)}, ${q(readme)}, ${first}, ${last});`,
	);

	let latest = null;
	source.releases.forEach(([version, daysAgo, tag], i) => {
		const bytes = `${source.name}@${version}`;
		const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
		const shasum = createHash("sha1").update(bytes).digest("hex");
		const size = Math.round(source.baseSize * (1 + i * 0.07));
		const manifest = {
			...pkg,
			name: source.name,
			version,
			_id: `${source.name}@${version}`,
			_npmVersion: "11.6.2",
			_nodeVersion: "24.10.0",
			dist: { integrity, shasum, fileCount: 12 + i * 2, unpackedSize: Math.round(size * 3.4) },
		};
		const publishedAt = now - daysAgo * DAY + Math.round(random() * 6 * 60 * 60 * 1000);
		sql.push(
			`INSERT INTO versions (package_name, version, manifest, tarball_key, integrity, shasum, size, published_by, created_at) VALUES (${q(source.name)}, ${q(version)}, ${q(JSON.stringify(manifest))}, ${q(`${source.name}/-/${shortName}-${version}.tgz`)}, ${q(integrity)}, ${q(shasum)}, ${size}, ${ownerId}, ${publishedAt});`,
		);
		if (tag) {
			sql.push(
				`INSERT INTO dist_tags (package_name, tag, version) VALUES (${q(source.name)}, ${q(tag)}, ${q(version)});`,
			);
		} else {
			latest = version;
		}
	});
	sql.push(
		`INSERT INTO dist_tags (package_name, tag, version) VALUES (${q(source.name)}, 'latest', ${q(latest)});`,
	);

	// Downloads from the first publish until today: weekdays busier than weekends, slowly growing.
	const firstDay = source.releases[0][1];
	const rows = [];
	for (let offset = Math.min(firstDay, 84); offset >= 0; offset--) {
		const weekday = new Date(now - offset * DAY).getUTCDay();
		const weekend = weekday === 0 || weekday === 6 ? 0.45 : 1;
		const growth = 0.35 + 0.65 * (1 - offset / 84);
		const count = Math.max(0, Math.round(source.daily * weekend * growth * (0.7 + random() * 0.6)));
		rows.push(`(${q(source.name)}, ${q(dayKey(offset))}, ${count})`);
	}
	sql.push(`INSERT INTO downloads (package_name, day, count) VALUES ${rows.join(", ")};`);
}

const out = join(root, ".wrangler", "seed");
mkdirSync(out, { recursive: true });
const file = join(out, "seed-local.sql");
writeFileSync(file, `${sql.join("\n")}\n`);
try {
	// wrangler prints a result object per statement; only show its output when it fails.
	execSync(`bunx wrangler d1 execute DB --local --file "${file}"`, { cwd: root, stdio: "pipe" });
} catch (error) {
	console.error(`${error.stdout ?? ""}${error.stderr ?? ""}`);
	console.error("seed: failed. Run `bun run setup` if the local D1 has no tables yet.");
	process.exit(1);
}
console.log(`seed: ${sources.length} packages in @${scopes.join(", @")} written to the local D1`);

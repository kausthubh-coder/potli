// Pure formatting and parsing for the package pages. No I/O; tested in packages.test.ts.

// npm's rules for the parts of a scoped name: lowercase, url-safe, no leading dot or underscore.
const NAME_PART = /^[a-z0-9][a-z0-9._~-]*$/;
const MAX_NAME_LENGTH = 214;

/** A scope from a URL segment, with or without the "@". Null when it can't be a scope. */
export function parseScope(segment: string): string | null {
	const scope = segment.startsWith("@") ? segment.slice(1) : segment;
	return NAME_PART.test(scope) && scope.length <= MAX_NAME_LENGTH ? scope : null;
}

/** The full "@scope/name" from the package route's two segments, or null when it isn't valid. */
export function parsePackageName(scopeSegment: string, nameSegment: string): string | null {
	const scope = parseScope(scopeSegment);
	if (!scope || !NAME_PART.test(nameSegment)) return null;
	const full = `@${scope}/${nameSegment}`;
	return full.length <= MAX_NAME_LENGTH ? full : null;
}

/** "@kausthubh/critly" -> { scope: "kausthubh", name: "critly" } */
export function splitPackageName(full: string): { scope: string; name: string } {
	const slash = full.indexOf("/");
	return { scope: full.slice(1, slash), name: full.slice(slash + 1) };
}

export type PackageManager = "npm" | "pnpm" | "bun";
export const PACKAGE_MANAGERS: PackageManager[] = ["npm", "pnpm", "bun"];

export function installCommand(pm: PackageManager, packageName: string): string {
	if (pm === "npm") return `npm i ${packageName}`;
	return `${pm} add ${packageName}`;
}

/** The .npmrc line that sends a scope to this registry. `origin` has no trailing slash. */
export function npmrcLine(scope: string, origin: string): string {
	return `@${scope}:registry=${origin}/`;
}

/** Tarball sizes the way npm prints them: 1000-based, one decimal from kB up. */
export function formatBytes(bytes: number): string {
	if (bytes < 1000) return `${bytes} B`;
	const units = ["kB", "MB", "GB"];
	let value = bytes / 1000;
	let unit = 0;
	while (value >= 1000 && unit < units.length - 1) {
		value /= 1000;
		unit++;
	}
	return `${value.toFixed(1)} ${units[unit]}`;
}

export function formatCount(n: number): string {
	return new Intl.NumberFormat("en-US").format(n);
}

/** "Oct 22, 2026", always in UTC so the server and the browser print the same text. */
export function formatDate(date: Date): string {
	return new Intl.DateTimeFormat("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	}).format(date);
}

/** "just now", "5 minutes ago", "3 days ago", "2 months ago", "1 year ago". */
export function timeAgo(date: Date, now: Date): string {
	const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
	const steps: [number, string][] = [
		[60, "second"],
		[60, "minute"],
		[24, "hour"],
		[30, "day"],
		[12, "month"],
		[Number.POSITIVE_INFINITY, "year"],
	];
	if (seconds < 45) return "just now";
	let value = seconds;
	for (const [size, unit] of steps) {
		if (value < size) {
			const n = Math.floor(value);
			return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
		}
		value /= size;
	}
	return formatDate(date);
}

type SemverParts = { core: [number, number, number]; pre: string[] } | null;

function parseSemver(version: string): SemverParts {
	const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
	if (!match) return null;
	return {
		core: [Number(match[1]), Number(match[2]), Number(match[3])],
		pre: match[4] ? match[4].split(".") : [],
	};
}

/** Semver precedence, for sorting versions newest first: compareVersions(b, a). */
export function compareVersions(a: string, b: string): number {
	const pa = parseSemver(a);
	const pb = parseSemver(b);
	if (!pa || !pb) return a < b ? -1 : a > b ? 1 : 0;
	for (let i = 0; i < 3; i++) {
		if (pa.core[i] !== pb.core[i]) return pa.core[i] - pb.core[i];
	}
	// A release outranks its prereleases: 1.0.0 > 1.0.0-beta.1.
	if (!pa.pre.length || !pb.pre.length) return pb.pre.length - pa.pre.length;
	for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
		const x = pa.pre[i];
		const y = pb.pre[i];
		if (x === undefined) return -1;
		if (y === undefined) return 1;
		const xn = /^\d+$/.test(x);
		const yn = /^\d+$/.test(y);
		if (xn && yn && Number(x) !== Number(y)) return Number(x) - Number(y);
		if (xn !== yn) return xn ? -1 : 1;
		if (x !== y) return x < y ? -1 : 1;
	}
	return 0;
}

export function isPrerelease(version: string): boolean {
	return (parseSemver(version)?.pre.length ?? 0) > 0;
}

/**
 * A browsable URL for a manifest's `repository`: the object form, "git+https://...git",
 * "git://", "git@github.com:owner/repo.git", or the "github:owner/repo" and "owner/repo"
 * shorthands. A monorepo `directory` becomes a /tree/HEAD/ link on GitHub.
 */
export function repositoryUrl(repository: unknown): string | null {
	let url: string | undefined;
	let directory: string | undefined;
	if (typeof repository === "string") url = repository;
	else if (repository && typeof repository === "object") {
		const r = repository as { url?: unknown; directory?: unknown };
		if (typeof r.url === "string") url = r.url;
		if (typeof r.directory === "string") directory = r.directory;
	}
	if (!url) return null;

	const shorthand = /^(?:(github|gitlab|bitbucket):)?([\w.-]+)\/([\w.-]+)$/.exec(url);
	if (shorthand) {
		const host = { github: "github.com", gitlab: "gitlab.com", bitbucket: "bitbucket.org" }[
			(shorthand[1] ?? "github") as "github" | "gitlab" | "bitbucket"
		];
		url = `https://${host}/${shorthand[2]}/${shorthand[3]}`;
	}

	url = url
		.replace(/^git\+/, "")
		.replace(/^git:\/\//, "https://")
		.replace(/^ssh:\/\/git@/, "https://")
		.replace(/^git@([^:]+):/, "https://$1/")
		.replace(/\.git$/, "")
		.replace(/\/$/, "");
	if (!/^https?:\/\//.test(url)) return null;
	if (directory && /^https:\/\/github\.com\//.test(url)) {
		url = `${url}/tree/HEAD/${directory.replace(/^\.?\/+/, "").replace(/\/$/, "")}`;
	}
	return url;
}

/** "github.com/kausthubh-coder/critly" for showing a link without its scheme. */
export function displayUrl(url: string): string {
	return url
		.replace(/^https?:\/\//, "")
		.replace(/\/tree\/HEAD\/.*$/, "")
		.replace(/\/$/, "");
}

/** Only http(s) links from a manifest are shown; anything else (javascript:, data:) is dropped. */
export function safeHttpUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
	} catch {
		return null;
	}
}

/** `license` is usually a string; very old packages use { type } or a `licenses` array. */
export function licenseName(manifest: Record<string, unknown>): string | null {
	const license = manifest.license;
	if (typeof license === "string" && license.trim()) return license.trim();
	if (license && typeof license === "object" && typeof (license as { type?: unknown }).type === "string") {
		return (license as { type: string }).type;
	}
	const licenses = manifest.licenses;
	if (Array.isArray(licenses) && licenses.length) {
		const names = licenses
			.map((l) => (l && typeof l === "object" ? (l as { type?: unknown }).type : null))
			.filter((t): t is string => typeof t === "string");
		if (names.length) return names.join(" OR ");
	}
	return null;
}

/** A manifest's dependencies as [name, range] pairs, sorted by name. */
export function dependencyList(manifest: Record<string, unknown>): [string, string][] {
	const deps = manifest.dependencies;
	if (!deps || typeof deps !== "object") return [];
	return Object.entries(deps as Record<string, unknown>)
		.filter((entry): entry is [string, string] => typeof entry[1] === "string")
		.sort(([a], [b]) => a.localeCompare(b));
}

/** "2026-10-22" for a date, in UTC, matching the `downloads.day` column. */
export function utcDay(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** The UTC day `days` before `date`. */
export function daysBefore(date: Date, days: number): string {
	return utcDay(new Date(date.getTime() - days * 24 * 60 * 60 * 1000));
}

/**
 * Daily counts folded into `weeks` totals, oldest first, each ending on a 7-day boundary that
 * ends today. The last entry is the past 7 days (today included), which is "weekly downloads".
 */
export function weeklyTotals(rows: { day: string; count: number }[], today: Date, weeks: number): number[] {
	const totals = new Array<number>(weeks).fill(0);
	const end = Date.parse(`${utcDay(today)}T00:00:00Z`);
	for (const row of rows) {
		const daysAgo = Math.round((end - Date.parse(`${row.day}T00:00:00Z`)) / (24 * 60 * 60 * 1000));
		if (daysAgo < 0 || daysAgo >= weeks * 7) continue;
		totals[weeks - 1 - Math.floor(daysAgo / 7)] += row.count;
	}
	return totals;
}

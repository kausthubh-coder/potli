import { describe, expect, it } from "vitest";

import {
	compareVersions,
	dependencyList,
	displayUrl,
	formatBytes,
	formatCount,
	formatDate,
	installCommand,
	isPrerelease,
	licenseName,
	npmrcLine,
	parsePackageName,
	parseScope,
	repositoryUrl,
	safeHttpUrl,
	splitPackageName,
	timeAgo,
	weeklyTotals,
} from "./packages.logic";

describe("package names from the URL", () => {
	it("accepts the scope with or without @ and builds the full name", () => {
		expect(parsePackageName("@kausthubh", "critly")).toBe("@kausthubh/critly");
		expect(parsePackageName("kausthubh", "critly")).toBe("@kausthubh/critly");
		expect(parsePackageName("@kriyan", "cli.v2_beta-1")).toBe("@kriyan/cli.v2_beta-1");
		expect(splitPackageName("@kausthubh/critly")).toEqual({ scope: "kausthubh", name: "critly" });
	});

	it("rejects names npm would reject", () => {
		expect(parsePackageName("@Kausthubh", "critly")).toBeNull();
		expect(parsePackageName("@kausthubh", "Critly")).toBeNull();
		expect(parsePackageName("@kausthubh", ".hidden")).toBeNull();
		expect(parsePackageName("@kausthubh", "_private")).toBeNull();
		expect(parsePackageName("@", "critly")).toBeNull();
		expect(parsePackageName("@a b", "critly")).toBeNull();
		expect(parsePackageName("@kausthubh", "a".repeat(210))).toBeNull();
		expect(parseScope("@kriyan")).toBe("kriyan");
		expect(parseScope("kri/yan")).toBeNull();
	});
});

describe("install instructions", () => {
	it("prints each package manager's add command", () => {
		expect(installCommand("npm", "@kausthubh/critly")).toBe("npm i @kausthubh/critly");
		expect(installCommand("pnpm", "@kausthubh/critly")).toBe("pnpm add @kausthubh/critly");
		expect(installCommand("bun", "@kausthubh/critly")).toBe("bun add @kausthubh/critly");
	});

	it("points the scope at the origin the page was served from", () => {
		expect(npmrcLine("kausthubh", "http://localhost:3689")).toBe(
			"@kausthubh:registry=http://localhost:3689/",
		);
		expect(npmrcLine("kriyan", "https://potli.dev")).toBe("@kriyan:registry=https://potli.dev/");
	});
});

describe("formatting", () => {
	it("prints sizes 1000-based like npm", () => {
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(41_200)).toBe("41.2 kB");
		expect(formatBytes(2_450_000)).toBe("2.5 MB");
	});

	it("groups thousands and prints UTC dates", () => {
		expect(formatCount(1234567)).toBe("1,234,567");
		// 23:30 UTC on Oct 21 is Oct 21 everywhere this page renders, server or browser.
		expect(formatDate(new Date("2026-10-21T23:30:00Z"))).toBe("Oct 21, 2026");
	});

	it("says how long ago, in the largest whole unit", () => {
		const now = new Date("2026-10-22T12:00:00Z");
		const ago = (ms: number) => timeAgo(new Date(now.getTime() - ms), now);
		expect(ago(10_000)).toBe("just now");
		expect(ago(60_000)).toBe("1 minute ago");
		expect(ago(5 * 60 * 60_000)).toBe("5 hours ago");
		expect(ago(3 * 24 * 60 * 60_000)).toBe("3 days ago");
		expect(ago(65 * 24 * 60 * 60_000)).toBe("2 months ago");
		expect(ago(400 * 24 * 60 * 60_000)).toBe("1 year ago");
	});
});

describe("versions", () => {
	it("sorts by semver precedence, releases above their prereleases", () => {
		const versions = ["0.2.1", "0.10.0", "0.3.0-beta.1", "0.3.0-beta.10", "0.3.0-beta.2", "0.3.0", "0.2.0"];
		expect([...versions].sort((a, b) => compareVersions(b, a))).toEqual([
			"0.10.0",
			"0.3.0",
			"0.3.0-beta.10",
			"0.3.0-beta.2",
			"0.3.0-beta.1",
			"0.2.1",
			"0.2.0",
		]);
		expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBeLessThan(0);
		expect(compareVersions("1.0.0-1", "1.0.0-alpha")).toBeLessThan(0);
		expect(isPrerelease("0.3.0-beta.1")).toBe(true);
		expect(isPrerelease("0.3.0")).toBe(false);
	});
});

describe("manifest links", () => {
	it("turns every repository form into a browsable URL", () => {
		expect(
			repositoryUrl({
				type: "git",
				url: "git+https://github.com/kausthubh-coder/critly.git",
				directory: "packages/critly",
			}),
		).toBe("https://github.com/kausthubh-coder/critly/tree/HEAD/packages/critly");
		expect(repositoryUrl("github:kausthubh-coder/megha")).toBe("https://github.com/kausthubh-coder/megha");
		expect(repositoryUrl("kausthubh-coder/megha")).toBe("https://github.com/kausthubh-coder/megha");
		expect(repositoryUrl("gitlab:group/project")).toBe("https://gitlab.com/group/project");
		expect(repositoryUrl("git@github.com:o/r.git")).toBe("https://github.com/o/r");
		expect(repositoryUrl("git://github.com/o/r.git")).toBe("https://github.com/o/r");
		expect(repositoryUrl({ url: "javascript:alert(1)" })).toBeNull();
		expect(repositoryUrl(undefined)).toBeNull();
		expect(displayUrl("https://github.com/kausthubh-coder/critly/tree/HEAD/packages/critly")).toBe(
			"github.com/kausthubh-coder/critly",
		);
	});

	it("keeps only http(s) homepages", () => {
		expect(safeHttpUrl("https://critly.vercel.app/check")).toBe("https://critly.vercel.app/check");
		expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
		expect(safeHttpUrl("not a url")).toBeNull();
		expect(safeHttpUrl(42)).toBeNull();
	});

	it("reads the license in its modern and legacy shapes", () => {
		expect(licenseName({ license: "MIT" })).toBe("MIT");
		expect(licenseName({ license: { type: "ISC" } })).toBe("ISC");
		expect(licenseName({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] })).toBe("MIT OR Apache-2.0");
		expect(licenseName({})).toBeNull();
	});

	it("lists dependencies sorted by name, skipping malformed entries", () => {
		expect(dependencyList({ dependencies: { zod: "^4.0.0", "playwright-core": "^1.64.0", bad: 3 } })).toEqual(
			[
				["playwright-core", "^1.64.0"],
				["zod", "^4.0.0"],
			],
		);
		expect(dependencyList({})).toEqual([]);
	});
});

describe("downloads", () => {
	it("folds daily counts into 7-day totals ending today, oldest first", () => {
		const today = new Date("2026-10-22T15:00:00Z");
		const rows = [
			{ day: "2026-10-22", count: 5 }, // today: this week
			{ day: "2026-10-16", count: 7 }, // 6 days ago: this week
			{ day: "2026-10-15", count: 11 }, // 7 days ago: last week
			{ day: "2026-10-02", count: 13 }, // 20 days ago: three weeks ago
			{ day: "2026-09-01", count: 99 }, // outside the window
			{ day: "2026-10-23", count: 99 }, // tomorrow: ignored
		];
		expect(weeklyTotals(rows, today, 3)).toEqual([13, 11, 12]);
	});
});

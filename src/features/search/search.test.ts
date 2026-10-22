import { describe, expect, it } from "vitest";

import { containsPattern, matchRank, normalizeQuery } from "./search.logic";

describe("search query", () => {
	it("trims, collapses spaces, lowercases and caps the query", () => {
		expect(normalizeQuery("  Design   Lint ")).toBe("design lint");
		expect(normalizeQuery(undefined)).toBe("");
		expect(normalizeQuery(["a"])).toBe("");
		expect(normalizeQuery("x".repeat(500))).toHaveLength(100);
	});

	it("escapes LIKE wildcards so they match themselves", () => {
		expect(containsPattern("cli")).toBe("%cli%");
		expect(containsPattern("100%_done\\")).toBe("%100\\%\\_done\\\\%");
	});

	it("ranks exact names above prefixes above description matches", () => {
		const rank = (q: string, name: string, description: string | null = null) =>
			matchRank(q, name, description);
		expect(rank("@kriyan/cli", "@kriyan/cli")).toBe(0);
		expect(rank("cli", "@kriyan/cli")).toBe(1);
		expect(rank("crit", "@kausthubh/critly")).toBe(2);
		expect(rank("kausthubh", "@kausthubh/critly")).toBe(2);
		expect(rank("thubh", "@kausthubh/critly")).toBe(3);
		expect(rank("terminal", "@kriyan/cli", "Plan your days with Kriyan from a terminal.")).toBe(4);
	});
});

import { createServerFn } from "@tanstack/react-start";
import { or, sql } from "drizzle-orm";

import { packages } from "#/db/schema";
import { type PackageSummary, packageSummaries } from "#/features/packages/packages.server";
import { containsPattern, matchRank, normalizeQuery } from "./search.logic";

const LIMIT = 50;

// Searches D1 directly: a case-insensitive LIKE on the name and the description, ranked so an
// exact or prefix name match comes before a package that only mentions the word.
export const searchPackages = createServerFn({ method: "GET" })
	.validator((input: { q?: string }) => ({ q: normalizeQuery(input.q) }))
	.handler(async ({ data }) => {
		const query = data.q;
		if (!query) return { query, results: [] as PackageSummary[], renderedAt: new Date() };
		const pattern = containsPattern(query);
		const rows = await packageSummaries()
			.where(
				or(
					sql`lower(${packages.name}) like ${pattern} escape '\\'`,
					sql`lower(${packages.description}) like ${pattern} escape '\\'`,
				),
			)
			.limit(200);
		const results = rows
			.map((row) => ({ row, rank: matchRank(query, row.name, row.description) }))
			.sort((a, b) => a.rank - b.rank || b.row.weeklyDownloads - a.row.weeklyDownloads)
			.slice(0, LIMIT)
			.map(({ row }) => row);
		return { query, results: results satisfies PackageSummary[], renderedAt: new Date() };
	});

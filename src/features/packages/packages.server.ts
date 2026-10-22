import { and, eq, sql } from "drizzle-orm";

import { db } from "#/db";
import { distTags, downloads, packages } from "#/db/schema";
import { daysBefore } from "./packages.logic";

// Server-only: imported from server function handlers, never from components. Exporting this
// from a server function file would pull the D1 binding into the browser bundle.

export type PackageSummary = {
	name: string;
	description: string | null;
	version: string | null;
	updatedAt: Date;
	weeklyDownloads: number;
};

/** One row per package with its latest version and the past 7 days of downloads. */
export function packageSummaries() {
	const since = daysBefore(new Date(), 6);
	return db
		.select({
			name: packages.name,
			description: packages.description,
			updatedAt: packages.updatedAt,
			version: distTags.version,
			weeklyDownloads: sql<number>`coalesce((select sum(${downloads.count}) from ${downloads} where ${downloads.packageName} = ${packages.name} and ${downloads.day} >= ${since}), 0)`,
		})
		.from(packages)
		.leftJoin(distTags, and(eq(distTags.packageName, packages.name), eq(distTags.tag, "latest")))
		.$dynamic();
}

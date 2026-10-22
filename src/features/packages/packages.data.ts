import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "#/db";
import { distTags, downloads, packages, scopes, user, versions } from "#/db/schema";
import {
	compareVersions,
	daysBefore,
	dependencyList,
	isPrerelease,
	licenseName,
	parsePackageName,
	parseScope,
	repositoryUrl,
	safeHttpUrl,
	splitPackageName,
	weeklyTotals,
} from "./packages.logic";
import { type PackageSummary, packageSummaries } from "./packages.server";
import { renderReadme } from "./readme.logic";

export type { PackageSummary };

const CHART_WEEKS = 12;

export const getRecentPackages = createServerFn({ method: "GET" }).handler(async () => {
	const [recent, counts] = await db.batch([
		packageSummaries().orderBy(desc(packages.updatedAt)).limit(8),
		db.select({ packages: sql<number>`count(*)` }).from(packages),
	]);
	return {
		packages: recent satisfies PackageSummary[],
		total: counts[0]?.packages ?? 0,
		renderedAt: new Date(),
	};
});

export const getScopePage = createServerFn({ method: "GET" })
	.validator((input: { scope: string }) => ({ scope: String(input.scope) }))
	.handler(async ({ data }) => {
		const name = parseScope(data.scope);
		if (!name) throw notFound();
		const [scopeRows, list] = await db.batch([
			db
				.select({
					name: scopes.name,
					kind: scopes.kind,
					createdAt: scopes.createdAt,
					// Not user.name: D1 returns rows keyed by column name, and it would overwrite scopes.name.
					ownerUsername: user.username,
				})
				.from(scopes)
				.innerJoin(user, eq(user.id, scopes.ownerId))
				.where(eq(scopes.name, name)),
			packageSummaries().where(eq(packages.scope, name)).orderBy(desc(packages.updatedAt)),
		]);
		const scope = scopeRows[0];
		if (!scope) throw notFound({ data: { scope: name } });
		return { scope, packages: list satisfies PackageSummary[], renderedAt: new Date() };
	});

export type VersionRow = { version: string; publishedAt: Date; size: number; tags: string[] };

export const getPackagePage = createServerFn({ method: "GET" })
	.validator((input: { scope: string; name: string }) => ({
		scope: String(input.scope),
		name: String(input.name),
	}))
	.handler(async ({ data }) => {
		const fullName = parsePackageName(data.scope, data.name);
		if (!fullName) throw notFound({ data: { name: `${data.scope}/${data.name}`, scopeExists: false } });
		const { scope } = splitPackageName(fullName);
		const now = new Date();

		const [pkgRows, versionRows, tagRows, downloadRows] = await db.batch([
			db.select().from(packages).where(eq(packages.name, fullName)),
			db
				.select({ version: versions.version, publishedAt: versions.publishedAt, size: versions.size })
				.from(versions)
				.where(eq(versions.packageName, fullName)),
			db
				.select({ tag: distTags.tag, version: distTags.version })
				.from(distTags)
				.where(eq(distTags.packageName, fullName)),
			db
				.select({ day: downloads.day, count: downloads.count })
				.from(downloads)
				.where(
					and(eq(downloads.packageName, fullName), gte(downloads.day, daysBefore(now, CHART_WEEKS * 7 - 1))),
				),
		]);

		const pkg = pkgRows[0];
		if (!pkg || versionRows.length === 0) {
			const scopeRow = await db
				.select({ name: scopes.name })
				.from(scopes)
				.where(eq(scopes.name, scope))
				.get();
			throw notFound({ data: { name: fullName, scopeExists: Boolean(scopeRow) } });
		}

		const sorted = [...versionRows].sort((a, b) => compareVersions(b.version, a.version));
		const latestVersion =
			tagRows.find((t) => t.tag === "latest")?.version ??
			sorted.find((v) => !isPrerelease(v.version))?.version ??
			sorted[0].version;
		const latestRow = sorted.find((v) => v.version === latestVersion) ?? sorted[0];

		const manifestRow = await db
			.select({ manifest: versions.manifest })
			.from(versions)
			.where(and(eq(versions.packageName, fullName), eq(versions.version, latestRow.version)))
			.get();
		const manifest =
			manifestRow?.manifest && typeof manifestRow.manifest === "object"
				? (manifestRow.manifest as Record<string, unknown>)
				: {};
		const dist = (manifest.dist && typeof manifest.dist === "object" ? manifest.dist : {}) as Record<
			string,
			unknown
		>;
		const repository = repositoryUrl(manifest.repository);
		const bugs = manifest.bugs;

		const tagsByVersion = new Map<string, string[]>();
		for (const t of tagRows) tagsByVersion.set(t.version, [...(tagsByVersion.get(t.version) ?? []), t.tag]);
		const weekly = weeklyTotals(downloadRows, now, CHART_WEEKS);

		return {
			name: fullName,
			scope,
			description: pkg.description,
			readmeHtml: pkg.readme?.trim() ? renderReadme(pkg.readme, repository) : null,
			createdAt: pkg.createdAt,
			latest: {
				version: latestRow.version,
				publishedAt: latestRow.publishedAt,
				size: latestRow.size,
				unpackedSize: typeof dist.unpackedSize === "number" ? dist.unpackedSize : null,
				fileCount: typeof dist.fileCount === "number" ? dist.fileCount : null,
				license: licenseName(manifest),
				homepage: safeHttpUrl(manifest.homepage),
				repository,
				issues: safeHttpUrl(
					typeof bugs === "string"
						? bugs
						: bugs && typeof bugs === "object"
							? (bugs as { url?: unknown }).url
							: null,
				),
				dependencies: dependencyList(manifest),
				node:
					manifest.engines && typeof manifest.engines === "object"
						? (((manifest.engines as { node?: unknown }).node as string | undefined) ?? null)
						: null,
			},
			versions: sorted.map((v) => ({
				...v,
				tags: tagsByVersion.get(v.version) ?? [],
			})) satisfies VersionRow[],
			distTags: [...tagRows].sort((a, b) =>
				a.tag === "latest" ? -1 : b.tag === "latest" ? 1 : a.tag.localeCompare(b.tag),
			),
			weeklyDownloads: weekly[weekly.length - 1],
			weeklySeries: weekly,
			renderedAt: now,
		};
	});

export type PackagePageData = Awaited<ReturnType<typeof getPackagePage>>;

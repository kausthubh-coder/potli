import { env, waitUntil } from "cloudflare:workers";
import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getPath } from "hono/utils/url";

import { db } from "#/db";
import { distTags, downloads, packages, versions } from "#/db/schema";
import { decodeScopedSlash, type PackageName, parsePackageName, tarballUrl } from "./registry.names";

// The npm registry API. npm, pnpm, bun and yarn call these routes; the website never does.
// Protocol notes: docs/registry-protocol.md. Bindings come from `cloudflare:workers` (not
// `c.env`) so tests can call `registry.request(path, init)` exactly as a client would.
export const registry = new Hono({ getPath: (request) => decodeScopedSlash(getPath(request)) });

// Path segments: "@scope" and "name" of a scoped package.
const PKG = "/:scope{@[^/]+}/:name";

const NOT_FOUND = { error: "Not found" };

function packageNameFrom(scope: string, name: string): PackageName | null {
	return parsePackageName(`${scope}/${name}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// `npm ping`
registry.get("/-/ping", (c) => c.json({}));

// The packument: every version's manifest plus dist-tags. Tarball URLs are added here, from the
// request's origin, so the stored data works on any domain the registry is served from.
registry.get(PKG, async (c) => {
	const name = packageNameFrom(c.req.param("scope"), c.req.param("name"));
	if (!name) return c.json(NOT_FOUND, 404);

	const [[pkg], versionRows, tagRows] = await db.batch([
		db.select().from(packages).where(eq(packages.name, name.full)),
		db.select().from(versions).where(eq(versions.packageName, name.full)).orderBy(asc(versions.publishedAt)),
		db.select().from(distTags).where(eq(distTags.packageName, name.full)),
	]);
	if (!pkg) return c.json(NOT_FOUND, 404);

	const origin = new URL(c.req.url).origin;
	const versionDocs: Record<string, unknown> = {};
	const time: Record<string, string> = {
		created: pkg.createdAt.toISOString(),
		modified: pkg.updatedAt.toISOString(),
	};
	for (const row of versionRows) {
		const manifest = isRecord(row.manifest) ? row.manifest : {};
		const dist = isRecord(manifest.dist) ? manifest.dist : {};
		versionDocs[row.version] = {
			...manifest,
			dist: { ...dist, tarball: tarballUrl(origin, name, row.version) },
		};
		time[row.version] = row.publishedAt.toISOString();
	}

	return c.json({
		_id: name.full,
		name: name.full,
		description: pkg.description ?? undefined,
		"dist-tags": Object.fromEntries(tagRows.map((row) => [row.tag, row.version])),
		versions: versionDocs,
		time,
		readme: pkg.readme ?? undefined,
	});
});

// Tarballs are streamed from R2, never buffered: they can be megabytes and the Worker has 128 MB.
registry.get(`${PKG}/-/:file`, async (c) => {
	const name = packageNameFrom(c.req.param("scope"), c.req.param("name"));
	const file = c.req.param("file");
	const prefix = `${name?.base}-`;
	if (!name || !file.startsWith(prefix) || !file.endsWith(".tgz")) return c.json(NOT_FOUND, 404);
	const version = file.slice(prefix.length, -".tgz".length);

	const row = await db
		.select({ tarballKey: versions.tarballKey })
		.from(versions)
		.where(and(eq(versions.packageName, name.full), eq(versions.version, version)))
		.get();
	if (!row) return c.json(NOT_FOUND, 404);

	const object = await env.TARBALLS.get(row.tarballKey);
	if (!object) throw new Error(`Tarball missing from R2: ${row.tarballKey}`);

	if (c.req.method === "GET") waitUntil(countDownload(name.full));
	return new Response(object.body, {
		headers: {
			"Content-Type": "application/octet-stream",
			"Content-Length": String(object.size),
			ETag: object.httpEtag,
			// A published version never changes, so its tarball can be cached forever.
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
});

function countDownload(packageName: string) {
	const day = new Date().toISOString().slice(0, 10); // UTC day, "2026-10-22"
	return db
		.insert(downloads)
		.values({ packageName, day, count: 1 })
		.onConflictDoUpdate({
			target: [downloads.packageName, downloads.day],
			set: { count: sql`${downloads.count} + 1` },
		})
		.run();
}

registry.notFound((c) => c.json(NOT_FOUND, 404));

// Registry routes are everything under "/@" (scoped packages and their tarballs) and "/-/"
// (npm's special endpoints). The website must not use paths that start with either.
export function isRegistryPath(pathname: string): boolean {
	return pathname.startsWith("/@") || pathname.startsWith("/-/");
}

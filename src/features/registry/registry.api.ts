import { env, waitUntil } from "cloudflare:workers";
import { and, asc, count, eq, or, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getPath } from "hono/utils/url";

import { db } from "#/db";
import { distTags, downloads, packages, scopes, user, versions } from "#/db/schema";
import { authenticate, scopeOwnershipError, unauthorizedMessage } from "./registry.auth";
import { decodeScopedSlash, type PackageName, parsePackageName, tarballUrl } from "./registry.names";
import { isRecord, MAX_PUBLISH_BODY_BYTES, publish, SEMVER } from "./registry.publish";

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

// `npm publish`. The body limit is checked while it streams in, before JSON parsing buffers it.
registry.put(
	PKG,
	bodyLimit({
		maxSize: MAX_PUBLISH_BODY_BYTES,
		onError: (c) =>
			c.json(
				{
					error: `The publish is over the 16 MB request limit; tarballs can be at most 10 MB. Leave files out with "files" in package.json or .npmignore.`,
				},
				413,
			),
	}),
	async (c) => {
		const name = packageNameFrom(c.req.param("scope"), c.req.param("name"));
		if (!name) {
			return c.json(
				{
					error: "Package names look like @scope/name, with lowercase letters, digits, '-', '.', '_' or '~'.",
				},
				400,
			);
		}
		return publish(c, name);
	},
);

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

// `npm whoami`
registry.get("/-/whoami", async (c) => {
	const tokenUser = await authenticate(c.req.header("Authorization"));
	if (!tokenUser) return c.json({ error: unauthorizedMessage(c.req.url, "see who you are") }, 401);
	if (!tokenUser.username) {
		return c.json({ error: "Your account has no username yet. Sign in on the potli website again." }, 404);
	}
	return c.json({ username: tokenUser.username });
});

// `npm dist-tag ls|add|rm`. npm reads the tags before it changes one.
const DIST_TAGS = `/-/package${PKG}/dist-tags`;

registry.get(DIST_TAGS, async (c) => {
	const name = packageNameFrom(c.req.param("scope"), c.req.param("name"));
	if (!name) return c.json(NOT_FOUND, 404);
	const [[pkg], tagRows] = await db.batch([
		db.select({ name: packages.name }).from(packages).where(eq(packages.name, name.full)),
		db.select().from(distTags).where(eq(distTags.packageName, name.full)),
	]);
	if (!pkg) return c.json(NOT_FOUND, 404);
	return c.json(Object.fromEntries(tagRows.map((row) => [row.tag, row.version])));
});

// Returns the package if the token's user may change its tags, else the error response.
async function authorizeTagChange(c: Context, scope: string, base: string): Promise<PackageName | Response> {
	const tokenUser = await authenticate(c.req.header("Authorization"));
	if (!tokenUser) return c.json({ error: unauthorizedMessage(c.req.url, "change dist-tags") }, 401);
	const name = packageNameFrom(scope, base);
	const pkg =
		name &&
		(await db.select({ name: packages.name }).from(packages).where(eq(packages.name, name.full)).get());
	if (!name || !pkg) return c.json(NOT_FOUND, 404);
	const ownershipError = await scopeOwnershipError(tokenUser.id, name.scope);
	if (ownershipError) return c.json({ error: ownershipError }, 403);
	return name;
}

function touchPackage(name: PackageName) {
	return db.update(packages).set({ updatedAt: new Date() }).where(eq(packages.name, name.full));
}

// The body is the version as a JSON string: `"1.2.0"`.
registry.put(`${DIST_TAGS}/:tag`, async (c) => {
	const name = await authorizeTagChange(c, c.req.param("scope"), c.req.param("name"));
	if (name instanceof Response) return name;
	const tag = c.req.param("tag");
	if (SEMVER.test(tag) || encodeURIComponent(tag) !== tag) {
		return c.json({ error: `"${tag}" can't be a tag name. Use a name like beta or next.` }, 400);
	}

	const version: unknown = await c.req.json().catch(() => null);
	if (typeof version !== "string") {
		return c.json({ error: 'Send the version as a JSON string, like "1.2.0".' }, 400);
	}
	const published = await db
		.select({ version: versions.version })
		.from(versions)
		.where(and(eq(versions.packageName, name.full), eq(versions.version, version)))
		.get();
	if (!published) {
		return c.json({ error: `${name.full}@${version} is not published. Tag a version that is.` }, 404);
	}

	await db.batch([
		db
			.insert(distTags)
			.values({ packageName: name.full, tag, version })
			.onConflictDoUpdate({ target: [distTags.packageName, distTags.tag], set: { version } }),
		touchPackage(name),
	]);
	return c.json({ ok: true }, 201);
});

registry.delete(`${DIST_TAGS}/:tag`, async (c) => {
	const name = await authorizeTagChange(c, c.req.param("scope"), c.req.param("name"));
	if (name instanceof Response) return name;
	const tag = c.req.param("tag");
	// Clients install `latest` when no version is asked for, so it must always exist.
	if (tag === "latest") {
		return c.json(
			{
				error: `The latest tag can't be deleted. Point it at another version with: npm dist-tag add ${name.full}@<version> latest`,
			},
			400,
		);
	}

	const [deleted] = await db.batch([
		db
			.delete(distTags)
			.where(and(eq(distTags.packageName, name.full), eq(distTags.tag, tag)))
			.returning({ tag: distTags.tag }),
		touchPackage(name),
	]);
	if (deleted.length === 0) return c.json({ error: `${name.full} has no "${tag}" tag.` }, 404);
	return c.json({ ok: true });
});

// `npm search`: a plain LIKE over names and descriptions, in npm's response shape. There is no
// ranking yet, so every result scores 1.
registry.get("/-/v1/search", async (c) => {
	const text = (c.req.query("text") ?? "").trim();
	const size = Math.min(Math.max(Number.parseInt(c.req.query("size") ?? "", 10) || 20, 1), 250);
	const from = Math.max(Number.parseInt(c.req.query("from") ?? "", 10) || 0, 0);
	const pattern = `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
	const matches = or(
		sql`${packages.name} LIKE ${pattern} ESCAPE '\\'`,
		sql`${packages.description} LIKE ${pattern} ESCAPE '\\'`,
	);

	const [rows, [{ total }]] = await db.batch([
		db
			.select({
				name: packages.name,
				scope: packages.scope,
				description: packages.description,
				version: versions.version,
				manifest: versions.manifest,
				publishedAt: versions.publishedAt,
				owner: user.username,
			})
			.from(packages)
			.innerJoin(scopes, eq(scopes.name, packages.scope))
			.innerJoin(user, eq(user.id, scopes.ownerId))
			.leftJoin(distTags, and(eq(distTags.packageName, packages.name), eq(distTags.tag, "latest")))
			.leftJoin(
				versions,
				and(eq(versions.packageName, packages.name), eq(versions.version, distTags.version)),
			)
			.where(matches)
			.orderBy(asc(packages.name))
			.limit(size)
			.offset(from),
		db.select({ total: count() }).from(packages).where(matches),
	]);

	const origin = new URL(c.req.url).origin;
	return c.json({
		objects: rows.map((row) => {
			const keywords =
				isRecord(row.manifest) && Array.isArray(row.manifest.keywords) ? row.manifest.keywords : [];
			const people = row.owner ? [{ username: row.owner }] : [];
			return {
				package: {
					name: row.name,
					scope: row.scope,
					version: row.version ?? undefined,
					description: row.description ?? undefined,
					keywords,
					date: row.publishedAt?.toISOString(),
					links: { npm: `${origin}/package/${row.name}` },
					publisher: people[0],
					maintainers: people,
				},
				score: { final: 1, detail: { quality: 1, popularity: 1, maintenance: 1 } },
				searchScore: 1,
			};
		}),
		total,
		time: new Date().toUTCString(),
	});
});

registry.notFound((c) => c.json(NOT_FOUND, 404));

registry.onError((error, c) => {
	console.error(error);
	if (env.POSTHOG_KEY) waitUntil(reportException(error, c.req.method, new URL(c.req.url).pathname));
	return c.json(
		{
			error:
				"The registry hit an unexpected error. Try again; if it keeps happening, open an issue on potli's GitHub.",
		},
		500,
	);
});

// PostHog's capture endpoint, called directly: one event per uncaught error is all the
// registry needs, and an SDK would add a dependency to every request.
function reportException(error: Error, method: string, path: string) {
	return fetch("https://us.i.posthog.com/i/v0/e/", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			api_key: env.POSTHOG_KEY,
			event: "$exception",
			distinct_id: "potli-registry",
			properties: {
				$exception_list: [
					{ type: error.name, value: error.message, mechanism: { handled: false, synthetic: false } },
				],
				$exception_stack_trace_raw: error.stack,
				$process_person_profile: false,
				source: "registry",
				method,
				path,
			},
		}),
	});
}

// Registry routes are everything under "/@" (scoped packages and their tarballs) and "/-/"
// (npm's special endpoints). The website must not use paths that start with either.
export function isRegistryPath(pathname: string): boolean {
	return pathname.startsWith("/@") || pathname.startsWith("/-/");
}

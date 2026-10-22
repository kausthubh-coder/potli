import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { db } from "#/db";
import { distTags, downloads, packages, scopes, user, versions } from "#/db/schema";
import { registry } from "./registry.api";

// Every test file gets fresh local D1 and R2; tests in this file share them, so each test uses
// its own users, scopes and package names.

async function seedUser(username: string) {
	const id = `user-${username}`;
	await db.insert(user).values({ id, name: username, email: `${username}@example.com`, username });
	await db.insert(scopes).values({ name: username, ownerId: id, kind: "user" });
	return { id, username };
}

function randomTarball(size = 4096): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(size));
}

// Seeds a published version the way publish stores it: tarball in R2, manifest without
// dist.tarball in D1.
async function seedVersion(owner: { id: string; username: string }, base: string, version: string) {
	const name = `@${owner.username}/${base}`;
	const tarball = randomTarball();
	const tarballKey = `${name}/${version}/seeded.tgz`;
	await env.TARBALLS.put(tarballKey, tarball);
	await db
		.insert(packages)
		.values({ name, scope: owner.username, description: "A seeded package", readme: "# Seeded" })
		.onConflictDoNothing();
	await db.insert(versions).values({
		packageName: name,
		version,
		manifest: { name, version, dependencies: {}, dist: { integrity: "sha512-x", shasum: "abc" } },
		tarballKey,
		integrity: "sha512-x",
		shasum: "abc",
		size: tarball.byteLength,
		publishedBy: owner.id,
	});
	await db
		.insert(distTags)
		.values({ packageName: name, tag: "latest", version })
		.onConflictDoUpdate({ target: [distTags.packageName, distTags.tag], set: { version } });
	return { name, tarball };
}

describe("registry", () => {
	it("answers npm ping", async () => {
		const res = await registry.request("/-/ping");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({});
	});

	it("returns a JSON 404 for an unknown package", async () => {
		const res = await registry.request("/@nobody%2fnothing");
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "Not found" });
	});

	it("returns a JSON 404 for unscoped names and their tarballs", async () => {
		for (const path of ["/left-pad", "/left-pad/-/left-pad-1.0.0.tgz", "/@left-pad"]) {
			const res = await registry.request(path);
			expect(res.status, path).toBe(404);
			expect(await res.json(), path).toEqual({ error: "Not found" });
		}
	});
});

describe("install", () => {
	it("serves the packument for every spelling of a scoped name", async () => {
		const owner = await seedUser("reader");
		await seedVersion(owner, "pkg", "1.0.0");

		for (const path of ["/@reader%2fpkg", "/@reader%2Fpkg", "/@reader/pkg"]) {
			const res = await registry.request(`http://localhost:3000${path}`);
			expect(res.status, path).toBe(200);
			const body = await res.json<Record<string, unknown>>();
			expect(body, path).toMatchObject({
				_id: "@reader/pkg",
				name: "@reader/pkg",
				description: "A seeded package",
				readme: "# Seeded",
				"dist-tags": { latest: "1.0.0" },
				versions: {
					"1.0.0": {
						name: "@reader/pkg",
						version: "1.0.0",
						dependencies: {},
						dist: {
							integrity: "sha512-x",
							shasum: "abc",
							tarball: "http://localhost:3000/@reader/pkg/-/pkg-1.0.0.tgz",
						},
					},
				},
			});
			const time = body.time as Record<string, string>;
			expect(Object.keys(time).sort()).toEqual(["1.0.0", "created", "modified"]);
			expect(new Date(time["1.0.0"]).toISOString()).toBe(time["1.0.0"]);
		}
	});

	it("builds tarball URLs from the request's origin, never a fixed domain", async () => {
		const owner = await seedUser("origins");
		await seedVersion(owner, "pkg", "2.0.0");

		for (const origin of ["https://potli.example.workers.dev", "http://localhost:3455"]) {
			const res = await registry.request(`${origin}/@origins%2fpkg`);
			const body = await res.json<{ versions: Record<string, { dist: { tarball: string } }> }>();
			expect(body.versions["2.0.0"].dist.tarball).toBe(`${origin}/@origins/pkg/-/pkg-2.0.0.tgz`);
		}
	});

	it("streams the tarball byte for byte and counts the download for today", async () => {
		const owner = await seedUser("downloader");
		const { tarball } = await seedVersion(owner, "pkg", "1.0.0");

		const res = await registry.request("/@downloader/pkg/-/pkg-1.0.0.tgz");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(tarball);

		const day = new Date().toISOString().slice(0, 10);
		const counted = () =>
			db
				.select({ count: downloads.count })
				.from(downloads)
				.where(and(eq(downloads.packageName, "@downloader/pkg"), eq(downloads.day, day)))
				.get();
		await vi.waitFor(async () => expect(await counted()).toEqual({ count: 1 }));

		await registry.request("/@downloader/pkg/-/pkg-1.0.0.tgz");
		await vi.waitFor(async () => expect(await counted()).toEqual({ count: 2 }));
	});

	it("returns a JSON 404 for a tarball of an unknown version", async () => {
		const owner = await seedUser("missing");
		await seedVersion(owner, "pkg", "1.0.0");

		for (const path of ["/@missing/pkg/-/pkg-9.9.9.tgz", "/@missing/pkg/-/other-1.0.0.tgz"]) {
			const res = await registry.request(path);
			expect(res.status, path).toBe(404);
			expect(await res.json(), path).toEqual({ error: "Not found" });
		}
	});
});

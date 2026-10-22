import { env } from "cloudflare:workers";
import { Buffer } from "node:buffer";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { db } from "#/db";
import { distTags, downloads, packages, scopes, tokens, user, versions } from "#/db/schema";
import { generateToken, hashToken } from "#/features/tokens/tokens.logic";
import { registry } from "./registry.api";

// Every test file gets fresh local D1 and R2; tests in this file share them, so each test uses
// its own users, scopes and package names.

// A user who owns the scope matching their username and has one publish token.
async function seedUser(username: string) {
	const id = `user-${username}`;
	const token = generateToken();
	await db.insert(user).values({ id, name: username, email: `${username}@example.com`, username });
	await db.insert(scopes).values({ name: username, ownerId: id, kind: "user" });
	await db
		.insert(tokens)
		.values({ id: `token-${username}`, userId: id, name: "laptop", tokenHash: await hashToken(token) });
	return { id, username, token };
}

function randomTarball(size = 4096): Uint8Array<ArrayBuffer> {
	return crypto.getRandomValues(new Uint8Array(size));
}

// The body `npm publish` sends (libnpmpublish): one version, its tarball as a base64 attachment
// keyed "@scope/name-1.0.0.tgz", and dist.tarball pointing wherever the client thinks it goes.
async function publishBody(
	name: string,
	version: string,
	tarball: Uint8Array<ArrayBuffer>,
	options: { tags?: Record<string, string>; description?: string } = {},
) {
	const integrity = `sha512-${Buffer.from(await crypto.subtle.digest("SHA-512", tarball)).toString("base64")}`;
	const shasum = Buffer.from(await crypto.subtle.digest("SHA-1", tarball)).toString("hex");
	const description = options.description ?? "A test package";
	return {
		_id: name,
		name,
		description,
		"dist-tags": options.tags ?? { latest: version },
		versions: {
			[version]: {
				name,
				version,
				description,
				dependencies: { hono: "^4.0.0" },
				_id: `${name}@${version}`,
				dist: { integrity, shasum, tarball: `http://localhost:3455/${name}/-/${name}-${version}.tgz` },
			},
		},
		readme: `# ${name} ${version}`,
		_attachments: {
			[`${name}-${version}.tgz`]: {
				content_type: "application/octet-stream",
				data: Buffer.from(tarball).toString("base64"),
				length: tarball.byteLength,
			},
		},
	};
}

function put(path: string, body: unknown, token?: string) {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (token) headers.Authorization = `Bearer ${token}`;
	return registry.request(path, { method: "PUT", headers, body: JSON.stringify(body) });
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

describe("publish", () => {
	it("round-trips publish, packument and a byte-identical tarball", async () => {
		const owner = await seedUser("roundtrip");
		const tarball = randomTarball();
		const body = await publishBody("@roundtrip/pkg", "1.0.0", tarball);
		const { integrity, shasum } = body.versions["1.0.0"].dist;

		const res = await put("/@roundtrip%2fpkg", body, owner.token);
		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({ ok: true });

		const packument = await registry.request("https://potli.example.dev/@roundtrip%2fpkg");
		expect(packument.status).toBe(200);
		expect(await packument.json()).toMatchObject({
			_id: "@roundtrip/pkg",
			name: "@roundtrip/pkg",
			description: "A test package",
			readme: "# @roundtrip/pkg 1.0.0",
			"dist-tags": { latest: "1.0.0" },
			versions: {
				"1.0.0": {
					name: "@roundtrip/pkg",
					version: "1.0.0",
					dependencies: { hono: "^4.0.0" },
					dist: { integrity, shasum, tarball: "https://potli.example.dev/@roundtrip/pkg/-/pkg-1.0.0.tgz" },
				},
			},
		});

		const download = await registry.request("https://potli.example.dev/@roundtrip/pkg/-/pkg-1.0.0.tgz");
		expect(download.status).toBe(200);
		expect(new Uint8Array(await download.arrayBuffer())).toEqual(tarball);

		// D1 keeps the manifest without the client's tarball URL; it is rebuilt from the origin.
		const stored = await db
			.select({ manifest: versions.manifest, size: versions.size })
			.from(versions)
			.where(eq(versions.packageName, "@roundtrip/pkg"))
			.get();
		expect(stored?.size).toBe(4096);
		expect(stored?.manifest).toMatchObject({ dist: { integrity, shasum } });
		expect(stored?.manifest).not.toHaveProperty("dist.tarball");

		const token = await db
			.select({ lastUsedAt: tokens.lastUsedAt })
			.from(tokens)
			.where(eq(tokens.id, "token-roundtrip"))
			.get();
		expect(token?.lastUsedAt).toBeInstanceOf(Date);
	});

	it("adds a second version and moves latest", async () => {
		const owner = await seedUser("twoversions");
		await put(
			"/@twoversions%2fpkg",
			await publishBody("@twoversions/pkg", "1.0.0", randomTarball()),
			owner.token,
		);
		const res = await put(
			"/@twoversions%2fpkg",
			await publishBody("@twoversions/pkg", "1.1.0", randomTarball(), { description: "Newer" }),
			owner.token,
		);
		expect(res.status).toBe(201);

		const doc = await (await registry.request("/@twoversions%2fpkg")).json<Record<string, unknown>>();
		expect(doc["dist-tags"]).toEqual({ latest: "1.1.0" });
		expect(Object.keys(doc.versions as object)).toEqual(["1.0.0", "1.1.0"]);
		expect(doc.description).toBe("Newer");
	});

	it("keeps latest's description and readme when publishing under another tag", async () => {
		const owner = await seedUser("prerelease");
		await put(
			"/@prerelease%2fpkg",
			await publishBody("@prerelease/pkg", "1.0.0", randomTarball()),
			owner.token,
		);
		const beta = await publishBody("@prerelease/pkg", "2.0.0-beta.1", randomTarball(), {
			tags: { beta: "2.0.0-beta.1" },
			description: "Beta",
		});
		const res = await put("/@prerelease%2fpkg", beta, owner.token);
		expect(res.status).toBe(201);

		const doc = await (await registry.request("/@prerelease%2fpkg")).json<Record<string, unknown>>();
		expect(doc["dist-tags"]).toEqual({ latest: "1.0.0", beta: "2.0.0-beta.1" });
		expect(doc.description).toBe("A test package");
		expect(doc.readme).toBe("# @prerelease/pkg 1.0.0");
	});

	it("refuses to republish a version: published versions never change", async () => {
		const owner = await seedUser("immutable");
		const first = randomTarball();
		await put("/@immutable%2fpkg", await publishBody("@immutable/pkg", "1.0.0", first), owner.token);

		const res = await put(
			"/@immutable%2fpkg",
			await publishBody("@immutable/pkg", "1.0.0", randomTarball()),
			owner.token,
		);
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({
			error:
				'@immutable/pkg@1.0.0 is already published, and published versions never change. Bump "version" in package.json and publish again.',
		});

		const download = await registry.request("/@immutable/pkg/-/pkg-1.0.0.tgz");
		expect(new Uint8Array(await download.arrayBuffer())).toEqual(first);
	});

	it("needs a valid token", async () => {
		await seedUser("noauth");
		const body = await publishBody("@noauth/pkg", "1.0.0", randomTarball());
		const expected = {
			error:
				"You need a potli token to publish. Create one on the potli website and add it to .npmrc as //localhost/:_authToken=<token>",
		};

		for (const token of [undefined, generateToken(), "npm_notapotlitoken"]) {
			const res = await put("http://localhost/@noauth%2fpkg", body, token);
			expect(res.status, token).toBe(401);
			expect(await res.json(), token).toEqual(expected);
		}
		expect((await registry.request("/@noauth%2fpkg")).status).toBe(404);
	});

	it("only lets a scope's owner publish to it", async () => {
		const owner = await seedUser("owner");
		const intruder = await seedUser("intruder");

		const res = await put(
			"/@owner%2fpkg",
			await publishBody("@owner/pkg", "1.0.0", randomTarball()),
			intruder.token,
		);
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({
			error: "The scope @owner belongs to another user. Use a scope you own, such as your own @username.",
		});

		const unclaimed = await put(
			"/@unclaimed%2fpkg",
			await publishBody("@unclaimed/pkg", "1.0.0", randomTarball()),
			owner.token,
		);
		expect(unclaimed.status).toBe(403);
		expect(await unclaimed.json()).toEqual({
			error: "The scope @unclaimed is not claimed. Claim it on the potli website, then try again.",
		});
		expect((await registry.request("/@owner%2fpkg")).status).toBe(404);
	});

	it("rejects a tarball that does not match its integrity or shasum", async () => {
		const owner = await seedUser("corrupt");
		const expected = {
			error:
				"The tarball does not match its integrity or shasum. It was corrupted on the way; publish again.",
		};
		const other = await publishBody("@corrupt/pkg", "1.0.0", randomTarball());

		const badIntegrity = await publishBody("@corrupt/pkg", "1.0.0", randomTarball());
		badIntegrity.versions["1.0.0"].dist.integrity = other.versions["1.0.0"].dist.integrity;
		const res = await put("/@corrupt%2fpkg", badIntegrity, owner.token);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual(expected);

		const badShasum = await publishBody("@corrupt/pkg", "1.0.0", randomTarball());
		badShasum.versions["1.0.0"].dist.shasum = other.versions["1.0.0"].dist.shasum;
		const res2 = await put("/@corrupt%2fpkg", badShasum, owner.token);
		expect(res2.status).toBe(400);
		expect(await res2.json()).toEqual(expected);

		expect((await registry.request("/@corrupt%2fpkg")).status).toBe(404);
	});

	it("rejects names that disagree, invalid versions and multi-version bodies", async () => {
		const owner = await seedUser("strict");

		const res = await put(
			"/@strict%2fpkg",
			await publishBody("@strict/other", "1.0.0", randomTarball()),
			owner.token,
		);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: "The name in package.json must be @strict/pkg, the package you are publishing to.",
		});

		const res2 = await put(
			"/@strict%2fpkg",
			await publishBody("@strict/pkg", "1.0", randomTarball()),
			owner.token,
		);
		expect(res2.status).toBe(400);
		expect(await res2.json()).toEqual({
			error: '"1.0" is not a valid semver version. Set "version" in package.json to one like 1.0.0.',
		});

		const two = await publishBody("@strict/pkg", "1.0.0", randomTarball());
		Object.assign(two.versions, (await publishBody("@strict/pkg", "1.0.1", randomTarball())).versions);
		const res3 = await put("/@strict%2fpkg", two, owner.token);
		expect(res3.status).toBe(400);
		expect(await res3.json()).toEqual({ error: "Publish exactly one version and its tarball at a time." });
	});

	it("rejects tarballs over 10 MB", async () => {
		const owner = await seedUser("huge");
		const body = await publishBody("@huge/pkg", "1.0.0", new Uint8Array(10 * 1024 * 1024 + 1));

		const res = await put("/@huge%2fpkg", body, owner.token);
		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({
			error:
				'The tarball is over the 10 MB limit. Leave files out with "files" in package.json or .npmignore.',
		});
	});
});

describe("whoami", () => {
	it("returns the token user's username", async () => {
		const me = await seedUser("whoami");
		const res = await registry.request("/-/whoami", { headers: { Authorization: `Bearer ${me.token}` } });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ username: "whoami" });
	});

	it("needs a valid token", async () => {
		const res = await registry.request("http://localhost:3455/-/whoami", {
			headers: { Authorization: `Bearer ${generateToken()}` },
		});
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({
			error:
				"You need a potli token to see who you are. Create one on the potli website and add it to .npmrc as //localhost:3455/:_authToken=<token>",
		});
	});
});

describe("dist-tags", () => {
	function tagRequest(method: "PUT" | "DELETE", path: string, token: string, version?: string) {
		return registry.request(path, {
			method,
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
			body: version === undefined ? undefined : JSON.stringify(version),
		});
	}

	it("lists, sets and deletes tags the way npm dist-tag does", async () => {
		const owner = await seedUser("tagger");
		await put("/@tagger%2fpkg", await publishBody("@tagger/pkg", "1.0.0", randomTarball()), owner.token);
		await put("/@tagger%2fpkg", await publishBody("@tagger/pkg", "1.1.0", randomTarball()), owner.token);

		const set = await tagRequest("PUT", "/-/package/@tagger%2fpkg/dist-tags/stable", owner.token, "1.0.0");
		expect(set.status).toBe(201);
		expect(await set.json()).toEqual({ ok: true });

		const list = await registry.request("/-/package/@tagger%2fpkg/dist-tags");
		expect(await list.json()).toEqual({ latest: "1.1.0", stable: "1.0.0" });
		const packument = await (await registry.request("/@tagger%2fpkg")).json<Record<string, unknown>>();
		expect(packument["dist-tags"]).toEqual({ latest: "1.1.0", stable: "1.0.0" });

		const removed = await tagRequest("DELETE", "/-/package/@tagger%2fpkg/dist-tags/stable", owner.token);
		expect(removed.status).toBe(200);
		expect(await removed.json()).toEqual({ ok: true });
		expect(await (await registry.request("/-/package/@tagger%2fpkg/dist-tags")).json()).toEqual({
			latest: "1.1.0",
		});

		const again = await tagRequest("DELETE", "/-/package/@tagger%2fpkg/dist-tags/stable", owner.token);
		expect(again.status).toBe(404);
		expect(await again.json()).toEqual({ error: '@tagger/pkg has no "stable" tag.' });
	});

	it("never deletes latest and only tags published versions", async () => {
		const owner = await seedUser("keeplatest");
		await put(
			"/@keeplatest%2fpkg",
			await publishBody("@keeplatest/pkg", "1.0.0", randomTarball()),
			owner.token,
		);

		const res = await tagRequest("DELETE", "/-/package/@keeplatest%2fpkg/dist-tags/latest", owner.token);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error:
				"The latest tag can't be deleted. Point it at another version with: npm dist-tag add @keeplatest/pkg@<version> latest",
		});

		const unknown = await tagRequest(
			"PUT",
			"/-/package/@keeplatest%2fpkg/dist-tags/next",
			owner.token,
			"9.0.0",
		);
		expect(unknown.status).toBe(404);
		expect(await unknown.json()).toEqual({
			error: "@keeplatest/pkg@9.0.0 is not published. Tag a version that is.",
		});

		const semverTag = await tagRequest(
			"PUT",
			"/-/package/@keeplatest%2fpkg/dist-tags/1.0.0",
			owner.token,
			"1.0.0",
		);
		expect(semverTag.status).toBe(400);
		expect(await semverTag.json()).toEqual({
			error: '"1.0.0" can\'t be a tag name. Use a name like beta or next.',
		});

		expect(await (await registry.request("/-/package/@keeplatest%2fpkg/dist-tags")).json()).toEqual({
			latest: "1.0.0",
		});
	});

	it("only lets the scope's owner change tags", async () => {
		const owner = await seedUser("tagowner");
		const other = await seedUser("tagother");
		await put("/@tagowner%2fpkg", await publishBody("@tagowner/pkg", "1.0.0", randomTarball()), owner.token);

		const res = await tagRequest("PUT", "/-/package/@tagowner%2fpkg/dist-tags/beta", other.token, "1.0.0");
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({
			error: "The scope @tagowner belongs to another user. Use a scope you own, such as your own @username.",
		});

		const noToken = await registry.request("/-/package/@tagowner%2fpkg/dist-tags/beta", {
			method: "PUT",
			body: JSON.stringify("1.0.0"),
		});
		expect(noToken.status).toBe(401);

		expect(await (await registry.request("/-/package/@tagowner%2fpkg/dist-tags")).json()).toEqual({
			latest: "1.0.0",
		});
	});
});

describe("search", () => {
	it("finds packages by name or description in npm's response shape", async () => {
		const owner = await seedUser("searcher");
		const body = await publishBody("@searcher/needle", "1.2.0", randomTarball(), {
			description: "Finds things",
		});
		body.versions["1.2.0"] = { ...body.versions["1.2.0"], ...{ keywords: ["find"] } };
		await put("/@searcher%2fneedle", body, owner.token);
		await put(
			"/@searcher%2fhay",
			await publishBody("@searcher/hay", "0.1.0", randomTarball(), { description: "Has a needle in it" }),
			owner.token,
		);
		await put(
			"/@searcher%2fother",
			await publishBody("@searcher/other", "0.1.0", randomTarball(), { description: "Unrelated" }),
			owner.token,
		);

		const res = await registry.request("https://potli.example.dev/-/v1/search?text=NEEDLE&size=20");
		expect(res.status).toBe(200);
		const result = await res.json<{ objects: { package: Record<string, unknown> }[]; total: number }>();
		expect(result.total).toBe(2);
		expect(result.objects.map((object) => object.package.name)).toEqual([
			"@searcher/hay",
			"@searcher/needle",
		]);
		expect(result.objects[1]).toEqual({
			package: {
				name: "@searcher/needle",
				scope: "searcher",
				version: "1.2.0",
				description: "Finds things",
				keywords: ["find"],
				date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
				links: { npm: "https://potli.example.dev/package/@searcher/needle" },
				publisher: { username: "searcher" },
				maintainers: [{ username: "searcher" }],
			},
			score: { final: 1, detail: { quality: 1, popularity: 1, maintenance: 1 } },
			searchScore: 1,
		});

		const page = await (await registry.request("/-/v1/search?text=searcher&size=1&from=1")).json<{
			objects: { package: { name: string } }[];
			total: number;
		}>();
		expect(page.total).toBe(3);
		expect(page.objects.map((object) => object.package.name)).toEqual(["@searcher/needle"]);

		const none = await (await registry.request("/-/v1/search?text=100%25_")).json();
		expect(none).toMatchObject({ objects: [], total: 0 });
	});
});

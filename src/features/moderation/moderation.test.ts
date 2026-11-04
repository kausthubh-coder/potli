import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "#/db";
import { user } from "#/db/schema";
import {
	cookieHeaders,
	devSignInRequest,
	seedUser as seedAccount,
	signedIn,
} from "#/features/auth/auth.testing";
import { registry } from "#/features/registry/registry.api";
import { publishBody, put, randomTarball, seedUser } from "#/features/registry/registry.testing";
import { checkReport, isAdmin } from "./moderation.logic";
import {
	dismissReportForRequest,
	loadReportsForRequest,
	submitReportForRequest,
	takeDownForRequest,
} from "./moderation.server";

// ADMIN_LOGINS is "root-admin" in tests (vitest.config.ts). Tests share one D1, so each uses its
// own scope; the admin signs in once per test with its own session.

const ORIGIN = "http://localhost:3000";

// A fresh session for the one admin account, made the first time it's needed.
async function signInAdmin(): Promise<{ headers: Headers }> {
	const existing = await db.select({ id: user.id }).from(user).where(eq(user.username, "root-admin")).get();
	if (!existing) await seedAccount("root-admin");
	const res = await devSignInRequest("root-admin");
	if (res.status !== 200) throw new Error(`admin sign-in returned ${res.status}`);
	return { headers: cookieHeaders(res) };
}
const signedOut = (ip: string) => new Headers({ "cf-connecting-ip": ip });

async function publish(token: string, name: string, version: string, tarball = randomTarball()) {
	const res = await put(
		`${ORIGIN}/${name.replace("/", "%2f")}`,
		await publishBody(name, version, tarball),
		token,
	);
	return res;
}

type Packument = {
	versions: Record<string, unknown>;
	"dist-tags": Record<string, string>;
	time: object;
	readme?: string;
};

describe("admins", () => {
	it("are the GitHub logins in ADMIN_LOGINS, ignoring case; * is nobody", () => {
		expect(isAdmin("root-admin", "root-admin, Other")).toBe(true);
		expect(isAdmin("other", "root-admin, Other")).toBe(true);
		expect(isAdmin("someone", "root-admin")).toBe(false);
		expect(isAdmin("someone", "*")).toBe(false);
		expect(isAdmin(null, "root-admin")).toBe(false);
		expect(isAdmin("root-admin", undefined)).toBe(false);
	});

	it("are the only ones who see reports or take anything down", async () => {
		const owner = await seedUser("guarded");
		expect((await publish(owner.token, "@guarded/pkg", "1.0.0")).status).toBe(201);
		const someone = await signedIn("not-admin");

		expect(await loadReportsForRequest(someone.headers)).toBeNull();
		expect(await loadReportsForRequest(new Headers())).toBeNull();
		expect(await takeDownForRequest(someone.headers, { packageName: "@guarded/pkg", version: null })).toEqual(
			{
				ok: false,
				message: "Only potli's admins can do that.",
			},
		);
		expect(
			await takeDownForRequest(new Headers(), { packageName: "@guarded/pkg", version: "1.0.0" }),
		).toEqual({
			ok: false,
			message: "Only potli's admins can do that.",
		});
		expect((await registry.request("/@guarded/pkg/-/pkg-1.0.0.tgz")).status).toBe(200);
	});
});

describe("reports", () => {
	it("checks the reason and the details before anything is sent", () => {
		const base = { packageName: "@a/b", version: null, details: "" };
		expect(checkReport({ ...base, reason: "rude" })).toEqual({ ok: false, message: "Pick a reason" });
		expect(checkReport({ ...base, reason: "other" })).toEqual({
			ok: false,
			message: "Say what's wrong with this package",
		});
		expect(checkReport({ ...base, reason: "spam", details: "x".repeat(2001) })).toEqual({
			ok: false,
			message: "Use 2000 characters or fewer",
		});
		expect(checkReport({ ...base, reason: "spam", details: "  junk  " })).toEqual({
			ok: true,
			packageName: "@a/b",
			version: null,
			reason: "spam",
			details: "junk",
		});
	});

	it("refuses a package or version that doesn't exist", async () => {
		const owner = await seedUser("exists");
		await publish(owner.token, "@exists/pkg", "1.0.0");
		const ip = signedOut("192.0.2.1");
		const report = { reason: "spam", details: "" };
		expect(
			await submitReportForRequest(ip, { ...report, packageName: "@exists/nope", version: null }),
		).toEqual({
			ok: false,
			message: "There's no package named @exists/nope.",
		});
		expect(
			await submitReportForRequest(ip, { ...report, packageName: "@exists/pkg", version: "9.9.9" }),
		).toEqual({
			ok: false,
			message: "@exists/pkg@9.9.9 isn't published.",
		});
	});

	it("records who reported when they're signed in", async () => {
		const owner = await seedUser("named");
		await publish(owner.token, "@named/pkg", "1.0.0");
		const reporter = await signedIn("careful-reader");
		const headers = new Headers(reporter.headers);
		headers.set("cf-connecting-ip", "192.0.2.2");
		const sent = await submitReportForRequest(headers, {
			packageName: "@named/pkg",
			version: null,
			reason: "impersonation",
			details: "Copies the README of a well-known package",
		});
		expect(sent).toEqual({ ok: true });

		const admin = await signInAdmin();
		const queue = await loadReportsForRequest(admin.headers);
		expect(queue?.open.find((r) => r.packageName === "@named/pkg")).toMatchObject({
			reporter: "careful-reader",
			version: null,
			reason: "impersonation",
		});
	});

	it("can be dismissed, which takes nothing down", async () => {
		const owner = await seedUser("innocent");
		await publish(owner.token, "@innocent/pkg", "1.0.0");
		await submitReportForRequest(signedOut("192.0.2.3"), {
			packageName: "@innocent/pkg",
			version: "1.0.0",
			reason: "spam",
			details: "",
		});
		const admin = await signInAdmin();
		const report = (await loadReportsForRequest(admin.headers))?.open.find(
			(r) => r.packageName === "@innocent/pkg",
		);
		if (!report) throw new Error("the report should be open");

		expect(await dismissReportForRequest(admin.headers, { id: report.id })).toEqual({ ok: true });
		expect(await dismissReportForRequest(admin.headers, { id: report.id })).toEqual({
			ok: false,
			message: "That report is already resolved.",
		});
		const after = await loadReportsForRequest(admin.headers);
		expect(after?.open.some((r) => r.id === report.id)).toBe(false);
		expect(after?.resolved.find((r) => r.id === report.id)).toMatchObject({
			status: "dismissed",
			resolvedAt: expect.any(Date),
		});
		expect((await registry.request("/@innocent/pkg/-/pkg-1.0.0.tgz")).status).toBe(200);
	});
});

describe("taking down a version", () => {
	it("hides it from npm, fails its install with a clear message, and never lets its number be reused", async () => {
		const owner = await seedUser("mallory");
		const good = randomTarball();
		expect((await publish(owner.token, "@mallory/pkg", "1.0.0", good)).status).toBe(201);
		expect((await publish(owner.token, "@mallory/pkg", "1.0.1")).status).toBe(201);

		// Someone who isn't signed in reports the latest version.
		expect(
			await submitReportForRequest(signedOut("192.0.2.10"), {
				packageName: "@mallory/pkg",
				version: "1.0.1",
				reason: "malware",
				details: "postinstall uploads ~/.npmrc",
			}),
		).toEqual({ ok: true });

		const admin = await signInAdmin();
		const queue = await loadReportsForRequest(admin.headers);
		expect(queue?.open.filter((r) => r.packageName === "@mallory/pkg")).toEqual([
			{
				id: expect.any(String),
				packageName: "@mallory/pkg",
				version: "1.0.1",
				reason: "malware",
				details: "postinstall uploads ~/.npmrc",
				reporter: null,
				status: "open",
				createdAt: expect.any(Date),
				resolvedAt: null,
				packageTakenDown: false,
				versionTakenDown: false,
			},
		]);

		expect(
			await takeDownForRequest(admin.headers, { packageName: "@mallory/pkg", version: "1.0.1" }),
		).toEqual({
			ok: true,
		});

		// The packument leaves 1.0.1 out, and latest moves back to 1.0.0 so `npm install` still works.
		const doc = await (await registry.request(`${ORIGIN}/@mallory%2fpkg`)).json<Packument>();
		expect(Object.keys(doc.versions)).toEqual(["1.0.0"]);
		expect(doc["dist-tags"]).toEqual({ latest: "1.0.0" });
		expect(Object.keys(doc.time).sort()).toEqual(["1.0.0", "created", "modified"]);
		// The README shown was 1.0.1's; npm's manifest for 1.0.0 has none, so none is shown.
		expect(doc.readme).toBeUndefined();

		// A lockfile that pins 1.0.1 fails with a message that says why.
		const pinned = await registry.request(`${ORIGIN}/@mallory/pkg/-/pkg-1.0.1.tgz`);
		expect(pinned.status).toBe(410);
		expect(await pinned.json()).toEqual({
			error:
				"@mallory/pkg@1.0.1 was taken down for breaking potli's terms and can't be installed. Use another version. Terms: http://localhost:3000/terms",
		});
		const stillFine = await registry.request(`${ORIGIN}/@mallory/pkg/-/pkg-1.0.0.tgz`);
		expect(stillFine.status).toBe(200);
		expect(new Uint8Array(await stillFine.arrayBuffer())).toEqual(good);

		// The version number stays used: republishing it is a 409, and it can't be tagged.
		const again = await publish(owner.token, "@mallory/pkg", "1.0.1");
		expect(again.status).toBe(409);
		expect(await again.json()).toEqual({
			error:
				'@mallory/pkg@1.0.1 was taken down, and its version number can\'t be used again. Bump "version" in package.json and publish again.',
		});
		const tag = await registry.request("/-/package/@mallory%2fpkg/dist-tags/latest", {
			method: "PUT",
			headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
			body: JSON.stringify("1.0.1"),
		});
		expect(tag.status).toBe(410);
		expect(await tag.json()).toEqual({
			error: "@mallory/pkg@1.0.1 was taken down, so it can't be tagged. Tag another version.",
		});

		// The report is resolved, and the owner can carry on with a new version.
		const after = await loadReportsForRequest(admin.headers);
		expect(after?.open.filter((r) => r.packageName === "@mallory/pkg")).toEqual([]);
		expect(after?.resolved.find((r) => r.packageName === "@mallory/pkg")).toMatchObject({
			status: "removed",
			versionTakenDown: true,
			packageTakenDown: false,
		});
		expect(
			await takeDownForRequest(admin.headers, { packageName: "@mallory/pkg", version: "1.0.1" }),
		).toEqual({
			ok: false,
			message: "@mallory/pkg@1.0.1 is already taken down.",
		});
		expect((await publish(owner.token, "@mallory/pkg", "1.0.2")).status).toBe(201);
		const next = await (await registry.request("/@mallory%2fpkg")).json<Packument>();
		expect(Object.keys(next.versions)).toEqual(["1.0.0", "1.0.2"]);
		expect(next["dist-tags"]).toEqual({ latest: "1.0.2" });
	});

	it("moves latest to the newest release left, not a prerelease, and drops other tags on it", async () => {
		const owner = await seedUser("tagged");
		await publish(owner.token, "@tagged/pkg", "1.0.0");
		const beta = await publishBody("@tagged/pkg", "2.0.0-beta.1", randomTarball(), {
			tags: { beta: "2.0.0-beta.1" },
		});
		await put("/@tagged%2fpkg", beta, owner.token);
		await publish(owner.token, "@tagged/pkg", "1.1.0");
		const tagNext = await registry.request("/-/package/@tagged%2fpkg/dist-tags/next", {
			method: "PUT",
			headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
			body: JSON.stringify("1.1.0"),
		});
		expect(tagNext.status).toBe(201);

		const admin = await signInAdmin();
		expect(await takeDownForRequest(admin.headers, { packageName: "@tagged/pkg", version: "1.1.0" })).toEqual(
			{
				ok: true,
			},
		);
		const doc = await (await registry.request("/@tagged%2fpkg")).json<Packument>();
		expect(doc["dist-tags"]).toEqual({ latest: "1.0.0", beta: "2.0.0-beta.1" });
	});

	it("takes the whole package off npm when its last version goes", async () => {
		const owner = await seedUser("single");
		await publish(owner.token, "@single/pkg", "1.0.0");
		const admin = await signInAdmin();
		expect(await takeDownForRequest(admin.headers, { packageName: "@single/pkg", version: "1.0.0" })).toEqual(
			{
				ok: true,
			},
		);
		const res = await registry.request(`${ORIGIN}/@single%2fpkg`);
		expect(res.status).toBe(410);
		expect(await res.json()).toEqual({
			error:
				"@single/pkg was taken down for breaking potli's terms and can't be installed. Terms: http://localhost:3000/terms",
		});
	});
});

describe("taking down a package", () => {
	it("stops npm serving every version, hides it from search, and blocks new publishes", async () => {
		const owner = await seedUser("squatco");
		await publish(owner.token, "@squatco/tool", "1.0.0");
		await publish(owner.token, "@squatco/tool", "1.0.1");
		await submitReportForRequest(signedOut("192.0.2.20"), {
			packageName: "@squatco/tool",
			version: null,
			reason: "spam",
			details: "Empty package",
		});
		await submitReportForRequest(signedOut("192.0.2.21"), {
			packageName: "@squatco/tool",
			version: "1.0.0",
			reason: "other",
			details: "Same thing",
		});

		const admin = await signInAdmin();
		expect(await takeDownForRequest(admin.headers, { packageName: "@squatco/tool", version: null })).toEqual({
			ok: true,
		});

		const gone = {
			error:
				"@squatco/tool was taken down for breaking potli's terms and can't be installed. Terms: http://localhost:3000/terms",
		};
		for (const path of [
			"/@squatco%2ftool",
			"/@squatco/tool/-/tool-1.0.0.tgz",
			"/-/package/@squatco%2ftool/dist-tags",
		]) {
			const res = await registry.request(`${ORIGIN}${path}`);
			expect(res.status, path).toBe(410);
			expect(await res.json(), path).toEqual(gone);
		}

		const search = await (await registry.request("/-/v1/search?text=squatco")).json<{ total: number }>();
		expect(search.total).toBe(0);

		const more = await publish(owner.token, "@squatco/tool", "1.0.2");
		expect(more.status).toBe(403);
		expect(await more.json()).toEqual({
			error:
				"@squatco/tool was taken down for breaking potli's terms, so nothing more can be published to it. Terms: http://localhost:3000/terms",
		});

		// Both reports are resolved with it, and nobody can report it again.
		const after = await loadReportsForRequest(admin.headers);
		expect(after?.open.filter((r) => r.packageName === "@squatco/tool")).toEqual([]);
		expect(after?.resolved.filter((r) => r.packageName === "@squatco/tool").map((r) => r.status)).toEqual([
			"removed",
			"removed",
		]);
		expect(
			await submitReportForRequest(signedOut("192.0.2.22"), {
				packageName: "@squatco/tool",
				version: null,
				reason: "spam",
				details: "",
			}),
		).toEqual({ ok: false, message: "@squatco/tool was already taken down." });
		expect(await takeDownForRequest(admin.headers, { packageName: "@squatco/tool", version: null })).toEqual({
			ok: false,
			message: "@squatco/tool is already taken down.",
		});
	});
});

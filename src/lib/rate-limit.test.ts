import { eq, like } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "#/db";
import { rateLimits, reports, scopes, tokens, user } from "#/db/schema";
import { handleAuthRequest } from "#/features/auth/auth";
import { devSignInFetch, seedUser as seedAccount, signedIn } from "#/features/auth/auth.testing";
import { submitReportForRequest } from "#/features/moderation/moderation.server";
import { registry } from "#/features/registry/registry.api";
import { publishBody, put, randomTarball, seedUser } from "#/features/registry/registry.testing";
import { claimScopeForRequest } from "#/features/scopes/scopes.server";
import { createTokenForRequest } from "#/features/tokens/tokens.server";
import { rateLimit, tryAgainIn } from "./rate-limit";

// Every test file gets fresh local D1; tests here share it, so each uses its own user or IP.

const TRY_AGAIN = /Try again in \d+ (seconds?|minutes|hours)\.$/;

function fromIp(ip: string, cookies?: Headers): Headers {
	const headers = new Headers(cookies);
	headers.set("cf-connecting-ip", ip);
	return headers;
}

describe("publish limit", () => {
	it("answers npm with a 429 that says when to try again, and still serves every install", async () => {
		const owner = await seedUser("busy");
		for (let i = 0; i < 60; i++) {
			const res = await put(
				"/@busy%2fpkg",
				await publishBody("@busy/pkg", `1.0.${i}`, randomTarball(256)),
				owner.token,
			);
			expect(res.status, `publish ${i + 1}`).toBe(201);
		}

		const over = await put(
			"/@busy%2fpkg",
			await publishBody("@busy/pkg", "1.0.60", randomTarball(256)),
			owner.token,
		);
		expect(over.status).toBe(429);
		const retryAfter = Number(over.headers.get("Retry-After"));
		expect(retryAfter).toBeGreaterThan(0);
		expect(retryAfter).toBeLessThanOrEqual(3600);
		expect(await over.json()).toEqual({
			error: `potli allows 60 publishes an hour per account, and you've used them. Try again ${tryAgainIn(retryAfter)}.`,
		});

		// Nothing was written, and installs never touch the counters.
		const countersBefore = await db.select().from(rateLimits);
		for (let i = 0; i < 100; i++) {
			const doc = await registry.request("/@busy%2fpkg");
			expect(doc.status).toBe(200);
			if (i === 0) {
				const body = await doc.json<{
					versions: Record<string, unknown>;
					"dist-tags": Record<string, string>;
				}>();
				expect(Object.keys(body.versions)).toHaveLength(60);
				expect(body["dist-tags"]).toEqual({ latest: "1.0.59" });
			}
			const tarball = await registry.request(`/@busy/pkg/-/pkg-1.0.${i % 60}.tgz`);
			expect(tarball.status).toBe(200);
			await tarball.arrayBuffer();
		}
		expect(await db.select().from(rateLimits)).toEqual(countersBefore);

		// The limit is per account.
		const other = await seedUser("calm");
		const res = await put(
			"/@calm%2fpkg",
			await publishBody("@calm/pkg", "1.0.0", randomTarball(256)),
			other.token,
		);
		expect(res.status).toBe(201);
	});

	it("doesn't count publishes without a valid token", async () => {
		await seedUser("anon-target");
		const body = await publishBody("@anon-target/pkg", "1.0.0", randomTarball(256));
		for (let i = 0; i < 3; i++) expect((await put("/@anon-target%2fpkg", body)).status).toBe(401);
		expect(await db.select().from(rateLimits).where(like(rateLimits.key, "publish:%anon-target%"))).toEqual(
			[],
		);
	});
});

describe("windows", () => {
	it("starts the count over in the next window", async () => {
		const hour = 3_600_000;
		// A window in the future, so no other test's counts land in it.
		const start = (Math.floor(Date.now() / hour) + 10) * hour;
		for (let i = 0; i < 60; i++) expect(await rateLimit("publish", "user:windowed", start + i)).toBeNull();
		expect(await rateLimit("publish", "user:windowed", start + 1000)).toEqual({
			max: 60,
			retryAfterSeconds: 3599,
		});
		expect(await rateLimit("publish", "user:windowed", start + hour)).toBeNull();
	});

	it("says when to try again in words", () => {
		expect(tryAgainIn(1)).toBe("in 1 second");
		expect(tryAgainIn(45)).toBe("in 45 seconds");
		expect(tryAgainIn(600)).toBe("in 10 minutes");
		expect(tryAgainIn(3599)).toBe("in 60 minutes");
		expect(tryAgainIn(20_000)).toBe("in 6 hours");
	});
});

describe("website limits", () => {
	it("stops token creation after 10 an hour and creates nothing more", async () => {
		const maker = await signedIn("tokenmaker");
		for (let i = 0; i < 10; i++) {
			const created = await createTokenForRequest(maker.headers, { name: `ci-${i}` });
			expect(created.ok, `token ${i + 1}`).toBe(true);
		}
		const over = await createTokenForRequest(maker.headers, { name: "ci-10" });
		expect(over).toEqual({
			ok: false,
			message: expect.stringMatching(/^You can create 10 tokens an hour\. /),
		});
		if (over.ok) throw new Error("expected a refusal");
		expect(over.message).toMatch(TRY_AGAIN);
		expect(await db.select().from(tokens).where(eq(tokens.userId, maker.id))).toHaveLength(10);
	});

	it("stops scope claims after 20 a day", async () => {
		const squatter = await signedIn("squatter");
		for (let i = 0; i < 20; i++) {
			expect(
				(await claimScopeForRequest(squatter.headers, { name: `squat-${i}` })).ok,
				`claim ${i + 1}`,
			).toBe(true);
		}
		const over = await claimScopeForRequest(squatter.headers, { name: "@squat-20" });
		expect(over).toEqual({
			ok: false,
			reason: "rate-limited",
			message: expect.stringMatching(/^You can claim 20 scopes a day\. Try again in \d+ (minutes|hours)\.$/),
			name: "squat-20",
		});
		expect(await db.select().from(scopes).where(eq(scopes.name, "squat-20"))).toEqual([]);
	});

	it("takes 10 reports an hour from one network, signed in or not", async () => {
		const owner = await seedUser("reported");
		await put(
			"/@reported%2fpkg",
			await publishBody("@reported/pkg", "1.0.0", randomTarball(256)),
			owner.token,
		);
		const report = { packageName: "@reported/pkg", version: null, reason: "spam", details: "" };
		for (let i = 0; i < 10; i++) {
			expect(await submitReportForRequest(fromIp("192.0.2.50"), report), `report ${i + 1}`).toEqual({
				ok: true,
			});
		}
		const reporter = await signedIn("reporter");
		const over = await submitReportForRequest(fromIp("192.0.2.50", reporter.headers), report);
		expect(over).toEqual({
			ok: false,
			message: expect.stringMatching(/^potli takes 10 reports an hour from one network\. Try again in \d+/),
		});
		expect(await db.select().from(reports).where(eq(reports.packageName, "@reported/pkg"))).toHaveLength(10);
		expect(await submitReportForRequest(fromIp("192.0.2.51"), report)).toEqual({ ok: true });
	});
});

describe("sign-in and sign-up limits", () => {
	const signInUrl = "http://localhost:3000/api/auth/dev/sign-in";

	it("refuses the 31st sign-in from one IP in 10 minutes, and only from that IP", async () => {
		await seedAccount("returning");
		for (let i = 0; i < 30; i++) {
			const res = await handleAuthRequest(devSignInFetch("returning", signInUrl, "203.0.113.7"));
			expect(res.status, `sign-in ${i + 1}`).toBe(200);
		}

		const over = await handleAuthRequest(devSignInFetch("returning", signInUrl, "203.0.113.7"));
		expect(over.status).toBe(429);
		expect(Number(over.headers.get("Retry-After"))).toBeGreaterThan(0);
		expect(over.headers.getSetCookie()).toEqual([]);
		expect(await over.json()).toEqual({
			code: "rate_limited",
			message: expect.stringMatching(/^Too many sign-in attempts from your network\. Try again in \d+/),
		});

		// GitHub's redirect back lands on the sign-in page, which explains the limit.
		const callback = await handleAuthRequest(
			new Request("http://localhost:3000/api/auth/callback/github?code=abc&state=xyz", {
				headers: { "cf-connecting-ip": "203.0.113.7" },
			}),
		);
		expect(callback.status).toBe(302);
		expect(callback.headers.get("Location")).toBe("http://localhost:3000/sign-in?error=rate_limited");

		// Reading the session isn't a sign-in, and other networks are unaffected.
		const session = await handleAuthRequest(
			new Request("http://localhost:3000/api/auth/get-session", {
				headers: { "cf-connecting-ip": "203.0.113.7" },
			}),
		);
		expect(session.status).toBe(200);
		expect((await handleAuthRequest(devSignInFetch("returning", signInUrl, "203.0.113.8"))).status).toBe(200);
	});

	it("counts every new-account attempt from one IP, allowed or not, and creates nothing over the limit", async () => {
		for (let i = 0; i < 10; i++) {
			const res = await handleAuthRequest(devSignInFetch(`newcomer-${i}`, signInUrl, "198.51.100.1"));
			expect(res.status, `attempt ${i + 1}`).toBe(403);
			expect(await res.json()).toMatchObject({ code: "signup_closed" });
		}

		// bob is on SIGNUP_ALLOWLIST, but this network has used its attempts.
		const over = await handleAuthRequest(devSignInFetch("bob", signInUrl, "198.51.100.1"));
		expect(over.status).toBe(429);
		expect(await over.json()).toMatchObject({
			code: "rate_limited",
			message: expect.stringMatching(/^Too many new accounts from your network\. Try again in \d+/),
		});
		expect(await db.select().from(user).where(eq(user.username, "bob"))).toEqual([]);

		const elsewhere = await handleAuthRequest(devSignInFetch("bob", signInUrl, "198.51.100.2"));
		expect(elsewhere.status).toBe(200);
		expect(await db.select({ username: user.username }).from(user).where(eq(user.username, "bob"))).toEqual([
			{ username: "bob" },
		]);
	});
});

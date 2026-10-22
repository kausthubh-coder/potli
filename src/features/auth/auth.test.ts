import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "#/db";
import { scopes, session, user } from "#/db/schema";
import { claimOrgScope, ensureUserScope } from "#/features/scopes/scopes.logic";
import { cookieHeaders, devSignInRequest, seedUser } from "./auth.testing";
import { getSessionUser } from "./session";
import { isSignupAllowed, parseAllowlist } from "./signup.logic";

describe("sign-up allowlist", () => {
	it("parses comma-separated logins, trimmed and lowercased", () => {
		expect([...parseAllowlist(" alice, Bob ,,carol ")]).toEqual(["alice", "bob", "carol"]);
		expect([...parseAllowlist("")]).toEqual([]);
		expect([...parseAllowlist(undefined)]).toEqual([]);
	});

	it("allows only logins on the list, ignoring case", () => {
		expect(isSignupAllowed("alice", "alice, Bob")).toBe(true);
		expect(isSignupAllowed("BOB", "alice, Bob")).toBe(true);
		expect(isSignupAllowed("carol", "alice, Bob")).toBe(false);
		expect(isSignupAllowed("alic", "alice, Bob")).toBe(false);
		expect(isSignupAllowed(null, "alice, Bob")).toBe(false);
		expect(isSignupAllowed("alice", "")).toBe(false);
		expect(isSignupAllowed("alice", undefined)).toBe(false);
	});
});

describe("account creation (SIGNUP_ALLOWLIST is 'alice, Bob' in tests)", () => {
	it("creates an allowlisted account with a real session and its user scope", async () => {
		const res = await devSignInRequest("Alice");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { user: { id: string; username: string } };
		expect(body.user.username).toBe("alice");

		const signedIn = await getSessionUser(cookieHeaders(res));
		expect(signedIn).toEqual({ id: body.user.id, name: "alice", username: "alice", image: null });
		expect(await db.select().from(scopes).where(eq(scopes.name, "alice"))).toEqual([
			{ name: "alice", ownerId: body.user.id, kind: "user", createdAt: expect.any(Date) },
		]);
	});

	it("refuses a login that isn't on the list and creates nothing", async () => {
		const res = await devSignInRequest("carol");
		expect(res.status).toBe(403);
		expect(await res.json()).toMatchObject({ code: "signup_closed" });
		expect(res.headers.getSetCookie()).toEqual([]);
		expect(await db.select().from(user).where(eq(user.username, "carol"))).toEqual([]);
		expect(await db.select().from(scopes).where(eq(scopes.name, "carol"))).toEqual([]);
	});

	it("still signs in an existing account that isn't on the list", async () => {
		const id = await seedUser("dave");
		const res = await devSignInRequest("dave");
		expect(res.status).toBe(200);
		expect((await getSessionUser(cookieHeaders(res)))?.id).toBe(id);
	});

	it("keeps the account when its user scope is already taken, and says why", async () => {
		const ownerId = await seedUser("org-owner");
		expect((await claimOrgScope(db, ownerId, "bob")).ok).toBe(true);

		const res = await devSignInRequest("bob");
		expect(res.status).toBe(200);
		const bob = await getSessionUser(cookieHeaders(res));
		expect(bob?.username).toBe("bob");
		expect(await db.select({ ownerId: scopes.ownerId }).from(scopes).where(eq(scopes.name, "bob"))).toEqual([
			{ ownerId },
		]);
		if (!bob) throw new Error("bob should be signed in");
		expect(await ensureUserScope(db, bob)).toEqual({ status: "missing", name: "bob", reason: "taken" });
	});

	it("rejects a dev sign-in that isn't a GitHub login", async () => {
		const res = await devSignInRequest("not a login");
		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ code: "invalid_login" });
	});

	it("gives a signed-out request no user", async () => {
		expect(await getSessionUser(new Headers())).toBeNull();
		expect(
			await getSessionUser(new Headers({ cookie: "better-auth.session_token=forged.value" })),
		).toBeNull();
		expect(await db.select().from(session).where(eq(session.token, "forged"))).toEqual([]);
	});
});

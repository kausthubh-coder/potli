import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "#/db";
import { scopes } from "#/db/schema";
import { seedUser, signedIn } from "#/features/auth/auth.testing";
import {
	checkScopeName,
	claimOrgScope,
	createUserScope,
	ensureUserScope,
	listScopes,
	RESERVED_SCOPES,
} from "./scopes.logic";
import { claimScopeForRequest } from "./scopes.server";

describe("scope names", () => {
	it("accepts npm-valid names and strips a typed @", () => {
		expect(checkScopeName("acme")).toEqual({ ok: true, name: "acme" });
		expect(checkScopeName("a.b-c_d9")).toEqual({ ok: true, name: "a.b-c_d9" });
		expect(checkScopeName(" @acme ")).toEqual({ ok: true, name: "acme" });
		expect(checkScopeName("-dash")).toEqual({ ok: true, name: "-dash" });
		expect(checkScopeName("a".repeat(214))).toEqual({ ok: true, name: "a".repeat(214) });
	});

	it("rejects names npm won't take, saying how to fix them", () => {
		expect(checkScopeName("")).toEqual({ ok: false, reason: "empty", message: "Enter a scope name" });
		expect(checkScopeName("@")).toEqual({ ok: false, reason: "empty", message: "Enter a scope name" });
		expect(checkScopeName("a".repeat(215))).toEqual({
			ok: false,
			reason: "too-long",
			message: "Use 214 characters or fewer",
		});
		expect(checkScopeName("Acme")).toEqual({
			ok: false,
			reason: "uppercase",
			message: "Use lowercase letters: @acme",
		});
		for (const name of [".acme", "_acme"]) {
			expect(checkScopeName(name)).toEqual({
				ok: false,
				reason: "leading-dot-or-underscore",
				message: "Can't start with “.” or “_”",
			});
		}
		for (const name of ["ac me", "ac/me", "acme!", "accént", "a~b", "a%20b"]) {
			expect(checkScopeName(name)).toEqual({
				ok: false,
				reason: "characters",
				message: "Use only lowercase letters, digits, “-”, “.” and “_”",
			});
		}
	});

	it("reserves the names people would mistake for official ones", () => {
		for (const name of [
			"npm",
			"node",
			"react",
			"vercel",
			"cloudflare",
			"google",
			"microsoft",
			"github",
			"anthropic",
			"openai",
			"potli",
			"admin",
			"www",
			"api",
			"types",
		]) {
			expect(RESERVED_SCOPES.has(name)).toBe(true);
			expect(checkScopeName(name)).toEqual({
				ok: false,
				reason: "reserved",
				message: `@${name} is reserved`,
			});
		}
		expect(checkScopeName("@react")).toEqual({
			ok: false,
			reason: "reserved",
			message: "@react is reserved",
		});
		expect(checkScopeName("react-community")).toEqual({ ok: true, name: "react-community" });
	});
});

describe("claiming an org scope", () => {
	it("claims a free name for the claimer", async () => {
		const ann = await seedUser("ann");
		expect(await claimOrgScope(db, ann, "@ann-labs")).toEqual({ ok: true, name: "ann-labs" });
		expect(await db.select().from(scopes).where(eq(scopes.name, "ann-labs"))).toEqual([
			{ name: "ann-labs", ownerId: ann, kind: "org", createdAt: expect.any(Date) },
		]);
	});

	it("refuses a taken, already-owned, reserved or invalid name and changes nothing", async () => {
		const owner = await seedUser("owner1");
		const other = await seedUser("other1");
		await claimOrgScope(db, owner, "taken-co");

		expect(await claimOrgScope(db, other, "taken-co")).toEqual({
			ok: false,
			reason: "taken",
			message: "@taken-co is already taken",
			name: "taken-co",
		});
		expect(await claimOrgScope(db, owner, "taken-co")).toEqual({
			ok: false,
			reason: "yours",
			message: "You already own @taken-co",
			name: "taken-co",
		});
		expect(await claimOrgScope(db, other, "vercel")).toEqual({
			ok: false,
			reason: "reserved",
			message: "@vercel is reserved",
			name: "vercel",
		});
		expect(await claimOrgScope(db, other, "Taken-Co")).toEqual({
			ok: false,
			reason: "uppercase",
			message: "Use lowercase letters: @taken-co",
			name: "Taken-Co",
		});
		expect(await claimOrgScope(db, other, "bad name")).toEqual({
			ok: false,
			reason: "characters",
			message: "Use only lowercase letters, digits, “-”, “.” and “_”",
			name: "bad name",
		});
		expect(
			await db.select({ ownerId: scopes.ownerId }).from(scopes).where(eq(scopes.name, "taken-co")),
		).toEqual([{ ownerId: owner }]);
		expect(await listScopes(db, other)).toEqual([]);
	});

	it("claims for the session's user, whatever else the request says", async () => {
		const mia = await signedIn("mia");
		const noah = await signedIn("noah");

		expect(await claimScopeForRequest(mia.headers, { name: "mia-co" })).toEqual({ ok: true, name: "mia-co" });
		// A client can't name a different owner: extra fields are ignored, the cookie decides.
		const forged = { name: "noah-co", userId: mia.id, ownerId: mia.id };
		expect(await claimScopeForRequest(noah.headers, forged)).toEqual({ ok: true, name: "noah-co" });
		expect(await claimScopeForRequest(noah.headers, { name: "mia-co" })).toEqual({
			ok: false,
			reason: "taken",
			message: "@mia-co is already taken",
			name: "mia-co",
		});

		expect((await listScopes(db, mia.id)).map((s) => s.name)).toEqual(["mia-co"]);
		expect((await listScopes(db, noah.id)).map((s) => s.name)).toEqual(["noah-co"]);
		await expect(claimScopeForRequest(new Headers(), { name: "nobody-co" })).rejects.toThrow(
			"You're signed out. Sign in again to continue.",
		);
		expect(await db.select().from(scopes).where(eq(scopes.name, "nobody-co"))).toEqual([]);
	});
});

describe("user scopes", () => {
	it("creates the user scope when the login is free, and lists it first", async () => {
		const id = await seedUser("zed");
		expect(await createUserScope(db, { id, username: "zed" })).toBe(true);
		await claimOrgScope(db, id, "aaa-zed-org");
		expect((await listScopes(db, id)).map(({ name, kind }) => ({ name, kind }))).toEqual([
			{ name: "zed", kind: "user" },
			{ name: "aaa-zed-org", kind: "org" },
		]);
		expect(await ensureUserScope(db, { id, username: "zed" })).toEqual({ status: "owned", name: "zed" });
	});

	it("explains a missing user scope instead of failing", async () => {
		const reserved = await seedUser("vercel");
		expect(await createUserScope(db, { id: reserved, username: "vercel" })).toBe(false);
		expect(await ensureUserScope(db, { id: reserved, username: "vercel" })).toEqual({
			status: "missing",
			name: "vercel",
			reason: "reserved",
		});
		expect(await ensureUserScope(db, { id: reserved, username: null })).toEqual({
			status: "missing",
			name: "",
			reason: "no-username",
		});
	});

	it("gives an older account its free user scope when settings loads", async () => {
		const id = await seedUser("late-joiner");
		expect(await listScopes(db, id)).toEqual([]);
		expect(await ensureUserScope(db, { id, username: "late-joiner" })).toEqual({
			status: "owned",
			name: "late-joiner",
		});
		expect((await listScopes(db, id)).map(({ name, kind }) => ({ name, kind }))).toEqual([
			{ name: "late-joiner", kind: "user" },
		]);
	});
});

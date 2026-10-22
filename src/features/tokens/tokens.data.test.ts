import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "#/db";
import { tokens } from "#/db/schema";
import { signedIn } from "#/features/auth/auth.testing";
import { checkTokenName, listTokens } from "./tokens.data";
import { hashToken, tokenFromAuthHeader } from "./tokens.logic";
import { createTokenForRequest, revokeTokenForRequest } from "./tokens.server";

describe("token names", () => {
	it("trims names and rejects empty or long ones", () => {
		expect(checkTokenName("  laptop ")).toEqual({ ok: true, name: "laptop" });
		expect(checkTokenName("   ")).toEqual({ ok: false, message: "Enter a token name" });
		expect(checkTokenName("x".repeat(64))).toEqual({ ok: true, name: "x".repeat(64) });
		expect(checkTokenName("x".repeat(65))).toEqual({ ok: false, message: "Use 64 characters or fewer" });
	});
});

describe("publish tokens", () => {
	it("creates a token, stores only its hash, and revokes it", async () => {
		const ivy = await signedIn("ivy");
		const created = await createTokenForRequest(ivy.headers, { name: " laptop " });
		if (!created.ok) throw new Error(created.message);
		expect(created.token).toMatch(/^potli_[A-Za-z0-9_-]{43}$/);
		expect(tokenFromAuthHeader(`Bearer ${created.token}`)).toBe(created.token);
		expect(created.summary).toEqual({
			id: expect.any(String),
			name: "laptop",
			createdAt: expect.any(Number),
			lastUsedAt: null,
		});

		const rows = await db.select().from(tokens).where(eq(tokens.userId, ivy.id));
		expect(rows).toEqual([
			{
				id: created.summary.id,
				userId: ivy.id,
				name: "laptop",
				tokenHash: await hashToken(created.token),
				createdAt: new Date(created.summary.createdAt),
				lastUsedAt: null,
			},
		]);
		expect(JSON.stringify(rows)).not.toContain(created.token);
		expect(await listTokens(db, ivy.id)).toEqual([created.summary]);

		expect(await revokeTokenForRequest(ivy.headers, { id: created.summary.id })).toEqual({ ok: true });
		expect(await db.select().from(tokens).where(eq(tokens.userId, ivy.id))).toEqual([]);
		expect(await revokeTokenForRequest(ivy.headers, { id: created.summary.id })).toEqual({
			ok: false,
			message: "That token is already gone. Reload to see your tokens.",
		});
	});

	it("refuses a duplicate or empty name for the same user", async () => {
		const jo = await signedIn("jo");
		expect((await createTokenForRequest(jo.headers, { name: "ci" })).ok).toBe(true);
		expect(await createTokenForRequest(jo.headers, { name: "ci" })).toEqual({
			ok: false,
			message: "You already have a token named “ci”",
		});
		expect(await createTokenForRequest(jo.headers, { name: "" })).toEqual({
			ok: false,
			message: "Enter a token name",
		});
		expect((await listTokens(db, jo.id)).map((t) => t.name)).toEqual(["ci"]);
	});

	it("never lets one user revoke another user's token", async () => {
		const kim = await signedIn("kim");
		const lee = await signedIn("lee");
		const kims = await createTokenForRequest(kim.headers, { name: "ci" });
		if (!kims.ok) throw new Error(kims.message);

		expect(await revokeTokenForRequest(lee.headers, { id: kims.summary.id })).toEqual({
			ok: false,
			message: "That token is already gone. Reload to see your tokens.",
		});
		expect(await listTokens(db, kim.id)).toEqual([kims.summary]);
		expect(await listTokens(db, lee.id)).toEqual([]);
	});

	it("refuses every token action without a session", async () => {
		const max = await signedIn("max");
		const maxs = await createTokenForRequest(max.headers, { name: "ci" });
		if (!maxs.ok) throw new Error(maxs.message);

		await expect(createTokenForRequest(new Headers(), { name: "x" })).rejects.toThrow(
			"You're signed out. Sign in again to continue.",
		);
		await expect(revokeTokenForRequest(new Headers(), { id: maxs.summary.id })).rejects.toThrow(
			"You're signed out. Sign in again to continue.",
		);
		expect(await listTokens(db, max.id)).toEqual([maxs.summary]);
	});
});

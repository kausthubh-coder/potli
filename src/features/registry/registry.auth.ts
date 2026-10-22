import { eq } from "drizzle-orm";

import { db } from "#/db";
import { scopes, tokens, user } from "#/db/schema";
import { hashToken, tokenFromAuthHeader } from "#/features/tokens/tokens.logic";

export type TokenUser = { id: string; username: string | null };

// Looks up the user behind `Authorization: Bearer <token>` and records that the token was used.
export async function authenticate(authorization: string | undefined): Promise<TokenUser | null> {
	const token = tokenFromAuthHeader(authorization);
	if (!token) return null;
	const row = await db
		.select({ tokenId: tokens.id, id: user.id, username: user.username })
		.from(tokens)
		.innerJoin(user, eq(tokens.userId, user.id))
		.where(eq(tokens.tokenHash, await hashToken(token)))
		.get();
	if (!row) return null;
	await db.update(tokens).set({ lastUsedAt: new Date() }).where(eq(tokens.id, row.tokenId));
	return { id: row.id, username: row.username };
}

// npm prints this to the user, so it says how to fix it.
export function unauthorizedMessage(requestUrl: string, action: string): string {
	const host = new URL(requestUrl).host;
	return `You need a potli token to ${action}. Create one on the potli website and add it to .npmrc as //${host}/:_authToken=<token>`;
}

// Null when the user owns the scope, else the message for the 403.
export async function scopeOwnershipError(userId: string, scope: string): Promise<string | null> {
	const row = await db.select({ ownerId: scopes.ownerId }).from(scopes).where(eq(scopes.name, scope)).get();
	if (!row) return `The scope @${scope} is not claimed. Claim it on the potli website, then try again.`;
	if (row.ownerId !== userId) {
		return `The scope @${scope} belongs to another user. Use a scope you own, such as your own @username.`;
	}
	return null;
}

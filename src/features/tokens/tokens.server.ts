// Server-side entry points for the token server functions, taking the request's headers so
// tests can call them without the TanStack Start runtime.
import { db } from "#/db";
import { requireSessionUser } from "#/features/auth/session";
import { createToken, revokeToken } from "./tokens.data";

// The owner is the session's user. Nothing in the input can name another user.
export async function createTokenForRequest(headers: Headers, input: { name: string }) {
	const user = await requireSessionUser(headers);
	return createToken(db, user.id, input.name);
}

export async function revokeTokenForRequest(headers: Headers, input: { id: string }) {
	const user = await requireSessionUser(headers);
	const revoked = await revokeToken(db, user.id, input.id);
	return revoked
		? { ok: true as const }
		: { ok: false as const, message: "That token is already gone. Reload to see your tokens." };
}

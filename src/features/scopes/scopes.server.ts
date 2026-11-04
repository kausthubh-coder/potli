// Server-side entry points for the scopes server functions, taking the request's headers so
// tests can call them without the TanStack Start runtime.
import { db } from "#/db";
import { requireSessionUser } from "#/features/auth/session";
import { rateLimit, tryAgainIn, userSubject } from "#/lib/rate-limit";
import { claimOrgScope, type ScopeAvailability } from "./scopes.logic";

// The owner is the session's user. Nothing in the input can name another user.
export async function claimScopeForRequest(
	headers: Headers,
	input: { name: string },
): Promise<ScopeAvailability> {
	const user = await requireSessionUser(headers);
	const limited = await rateLimit("claim-scope", userSubject(user.id));
	if (limited) {
		return {
			ok: false,
			reason: "rate-limited",
			message: `You can claim ${limited.max} scopes a day. Try again ${tryAgainIn(limited.retryAfterSeconds)}.`,
			name: input.name.trim().replace(/^@/, ""),
		};
	}
	return claimOrgScope(db, user.id, input.name);
}

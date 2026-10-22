// Server-side entry points for the scopes server functions, taking the request's headers so
// tests can call them without the TanStack Start runtime.
import { db } from "#/db";
import { requireSessionUser } from "#/features/auth/session";
import { claimOrgScope } from "./scopes.logic";

// The owner is the session's user. Nothing in the input can name another user.
export async function claimScopeForRequest(headers: Headers, input: { name: string }) {
	const user = await requireSessionUser(headers);
	return claimOrgScope(db, user.id, input.name);
}

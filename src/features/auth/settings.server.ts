// Everything the settings page shows, for the session's user. Server-only.
import { db } from "#/db";
import { ensureUserScope, listScopes } from "#/features/scopes/scopes.logic";
import { listTokens } from "#/features/tokens/tokens.data";
import { getSessionUser } from "./session";

export async function loadSettingsForRequest(headers: Headers) {
	const user = await getSessionUser(headers);
	if (!user) return null;
	const userScope = await ensureUserScope(db, user);
	const [scopes, tokens] = await Promise.all([listScopes(db, user.id), listTokens(db, user.id)]);
	return { user, userScope, scopes, tokens };
}

// Every server function that reads or changes account data starts here. The user always comes
// from the session cookie on the request, never from the client's input.
import { auth } from "./auth";

export type SessionUser = { id: string; name: string; username: string | null; image: string | null };

export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
	const session = await auth.api.getSession({ headers });
	if (!session) return null;
	const { id, name, username, image } = session.user;
	return { id, name, username: username ?? null, image: image ?? null };
}

export class SignedOutError extends Error {
	constructor() {
		super("You're signed out. Sign in again to continue.");
		this.name = "SignedOutError";
	}
}

export async function requireSessionUser(headers: Headers): Promise<SessionUser> {
	const user = await getSessionUser(headers);
	if (!user) throw new SignedOutError();
	return user;
}

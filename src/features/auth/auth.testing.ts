// Test helpers: real Better Auth sessions through the dev sign-in endpoint, the same way the
// browser gets one. Only imported by *.test.ts files.
import { db } from "#/db";
import { user } from "#/db/schema";
import { auth } from "./auth";

export function devSignInRequest(login: string, url = "http://localhost:3000/api/auth/dev/sign-in") {
	return auth.handler(
		new Request(url, {
			method: "POST",
			headers: { "content-type": "application/json", origin: new URL(url).origin },
			body: JSON.stringify({ login }),
		}),
	);
}

export function cookieHeaders(res: Response): Headers {
	const cookie = res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");
	return new Headers({ cookie });
}

// An account that already exists, so the sign-up allowlist doesn't apply to it.
export async function seedUser(username: string) {
	const id = crypto.randomUUID();
	await db.insert(user).values({ id, name: username, email: `${username}@example.test`, username });
	return id;
}

export async function signedIn(username: string): Promise<{ id: string; headers: Headers }> {
	const id = await seedUser(username);
	const res = await devSignInRequest(username);
	if (res.status !== 200) throw new Error(`dev sign-in for ${username} returned ${res.status}`);
	return { id, headers: cookieHeaders(res) };
}

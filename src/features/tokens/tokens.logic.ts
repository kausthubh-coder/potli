// Publish tokens. The website creates them (shown once), the registry checks them on publish.
// Only the SHA-256 hex digest is stored, so a database leak does not leak working tokens.

const PREFIX = "potli_";

export function generateToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return (
		PREFIX +
		btoa(String.fromCharCode(...bytes))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "")
	);
}

export async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// npm sends `Authorization: Bearer <token>`.
export function tokenFromAuthHeader(header: string | undefined): string | null {
	const match = header?.match(/^Bearer\s+(potli_[A-Za-z0-9_-]{43})$/);
	return match?.[1] ?? null;
}

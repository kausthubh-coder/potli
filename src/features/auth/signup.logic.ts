// Only GitHub logins on SIGNUP_ALLOWLIST can create an account; `*` lets anyone sign up.
// Existing accounts always sign in.

export const SIGNUP_CLOSED = "signup_closed";

// Too many sign-ins or new accounts from one network (src/lib/rate-limit.ts).
export const RATE_LIMITED = "rate_limited";

// SIGNUP_ALLOWLIST is comma-separated GitHub logins, e.g. "kausthubh-coder, alice", or `*`.
export function parseAllowlist(value: string | undefined): Set<string> {
	return new Set(
		(value ?? "")
			.split(",")
			.map((login) => login.trim().toLowerCase())
			.filter((login) => login !== ""),
	);
}

export function isSignupAllowed(login: string | null | undefined, allowlist: string | undefined): boolean {
	if (!login) return false;
	const logins = parseAllowlist(allowlist);
	return logins.has("*") || logins.has(login.trim().toLowerCase());
}

// Sign-up is closed until potli has size limits, takedowns and terms (docs/decisions.md). Only
// GitHub logins on SIGNUP_ALLOWLIST can create an account; existing accounts always sign in.

export const SIGNUP_CLOSED = "signup_closed";

// SIGNUP_ALLOWLIST is comma-separated GitHub logins, e.g. "kausthubh-coder, alice".
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
	return parseAllowlist(allowlist).has(login.trim().toLowerCase());
}

import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db } from "#/db";
import * as schema from "#/db/schema";
import { createUserScope } from "#/features/scopes/scopes.logic";
import { ipSubject, rateLimit, tryAgainIn } from "#/lib/rate-limit";
import { devSignIn, isDevSignInEnabled } from "./dev-sign-in";
import { isSignupAllowed, RATE_LIMITED, SIGNUP_CLOSED } from "./signup.logic";

export const auth = betterAuth({
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	database: drizzleAdapter(db, { provider: "sqlite", schema }),
	socialProviders: {
		github: {
			clientId: env.GITHUB_CLIENT_ID,
			clientSecret: env.GITHUB_CLIENT_SECRET,
			mapProfileToUser: (profile) => ({ username: profile.login.toLowerCase() }),
		},
	},
	user: {
		additionalFields: {
			username: { type: "string", required: false, input: false },
		},
	},
	// OAuth errors (like a closed sign-up) land on the sign-in page, which explains them.
	onAPIError: { errorURL: `${env.BETTER_AUTH_URL}/sign-in` },
	databaseHooks: {
		user: {
			create: {
				before: async (user, context) => {
					// Every new-account attempt counts, allowed or not, so one network can't script sign-ups.
					const headers = context?.request?.headers ?? context?.headers ?? new Headers();
					const limited = await rateLimit("sign-up", await ipSubject(headers));
					if (limited) {
						throw new APIError("TOO_MANY_REQUESTS", {
							code: RATE_LIMITED,
							message: `Too many new accounts from your network. Try again ${tryAgainIn(limited.retryAfterSeconds)}.`,
						});
					}
					const username = "username" in user && typeof user.username === "string" ? user.username : null;
					if (!isSignupAllowed(username, env.SIGNUP_ALLOWLIST)) {
						throw new APIError("FORBIDDEN", {
							code: SIGNUP_CLOSED,
							message: "Sign-up is closed. This GitHub account isn't on the early access list.",
						});
					}
				},
				after: async (user) => {
					const username = "username" in user && typeof user.username === "string" ? user.username : null;
					await createUserScope(db, { id: user.id, username });
				},
			},
		},
	},
	// `import.meta.env.DEV` is written out here, not only inside isDevSignInEnabled, so `vite build`
	// folds it to false and drops the dev endpoint's code from the production bundle entirely.
	plugins: [...(import.meta.env.DEV && isDevSignInEnabled(env) ? [devSignIn()] : []), tanstackStartCookies()],
});

// The /api/auth/* route. Starting a sign-in and finishing one (the OAuth callback) count against a
// per-IP limit before Better Auth sees the request; reading the session and signing out don't.
export async function handleAuthRequest(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname.replace(/^\/api\/auth/, "");
	const countsAsSignIn =
		(request.method === "POST" && (path.startsWith("/sign-in/") || path === "/dev/sign-in")) ||
		(request.method === "GET" && path.startsWith("/callback/"));
	if (countsAsSignIn) {
		const limited = await rateLimit("sign-in", await ipSubject(request.headers));
		if (limited) {
			const retryAfter = String(limited.retryAfterSeconds);
			// The callback is a browser redirect from GitHub, so it lands on the sign-in page.
			if (request.method === "GET") {
				return new Response(null, {
					status: 302,
					headers: { Location: `${url.origin}/sign-in?error=${RATE_LIMITED}`, "Retry-After": retryAfter },
				});
			}
			return Response.json(
				{
					code: RATE_LIMITED,
					message: `Too many sign-in attempts from your network. Try again ${tryAgainIn(limited.retryAfterSeconds)}.`,
				},
				{ status: 429, headers: { "Retry-After": retryAfter } },
			);
		}
	}
	return auth.handler(request);
}

import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db } from "#/db";
import * as schema from "#/db/schema";
import { createUserScope } from "#/features/scopes/scopes.logic";
import { devSignIn, isDevSignInEnabled } from "./dev-sign-in";
import { isSignupAllowed, SIGNUP_CLOSED } from "./signup.logic";

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
				before: async (user) => {
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

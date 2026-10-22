// Dev-only sign-in: lets an agent or the developer drive signed-in pages before the GitHub OAuth
// app exists. It signs in as a GitHub login without asking GitHub, so it must never reach
// production. Three locks, each enough on its own:
//   1. `import.meta.env.DEV` is replaced with `false` by `vite build`, so the deployed bundle
//      never registers the endpoint.
//   2. It needs DEV_LOGIN=1, which lives only in .dev.vars (never a Worker secret or var).
//   3. BETTER_AUTH_URL and the request itself must be on localhost.
// New accounts still go through the same database hooks as GitHub sign-up (allowlist, user scope).
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

function isLocalhost(url: string | undefined): boolean {
	if (!url) return false;
	try {
		const { hostname } = new URL(url);
		return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
	} catch {
		return false;
	}
}

export function isDevSignInEnabled(env: { DEV_LOGIN?: string; BETTER_AUTH_URL?: string }): boolean {
	return import.meta.env.DEV && env.DEV_LOGIN === "1" && isLocalhost(env.BETTER_AUTH_URL);
}

export function devSignIn() {
	return {
		id: "potli-dev-sign-in",
		endpoints: {
			devSignIn: createAuthEndpoint("/dev/sign-in", { method: "POST", requireRequest: true }, async (ctx) => {
				if (!isLocalhost(ctx.request?.url)) throw new APIError("NOT_FOUND");
				const body: unknown = ctx.body;
				const raw = typeof body === "object" && body !== null && "login" in body ? body.login : undefined;
				const login = typeof raw === "string" ? raw.trim().toLowerCase() : "";
				if (!GITHUB_LOGIN.test(login)) {
					throw new APIError("BAD_REQUEST", {
						code: "invalid_login",
						message: "Enter a GitHub login: letters, digits and single hyphens, up to 39 characters",
					});
				}

				const existing = await ctx.context.adapter.findOne<{ id: string }>({
					model: "user",
					where: [{ field: "username", value: login }],
				});
				const user = existing
					? await ctx.context.internalAdapter.findUserById(existing.id)
					: await ctx.context.internalAdapter.createUser(
							{
								name: login,
								// .invalid never resolves, so this can't collide with a real GitHub email.
								email: `${login}@dev-sign-in.invalid`,
								emailVerified: false,
								username: login,
							},
							{ method: "dev-sign-in" },
						);
				if (!user) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Could not create the user" });

				const session = await ctx.context.internalAdapter.createSession(user.id);
				await setSessionCookie(ctx, { session, user });
				return ctx.json({ user: { id: user.id, username: login } });
			}),
		},
	} satisfies BetterAuthPlugin;
}

import { createFileRoute, redirect } from "@tanstack/react-router";

import { getSignInOptions } from "#/features/auth/auth.functions";
import { SignInPage } from "#/features/auth/SignInPage";

// Better Auth sends OAuth failures here as ?error=<code> (see onAPIError in auth.ts).
type SignInSearch = { error?: string };

export const Route = createFileRoute("/sign-in")({
	validateSearch: (search: Record<string, unknown>): SignInSearch =>
		typeof search.error === "string" ? { error: search.error } : {},
	loader: async () => {
		const options = await getSignInOptions();
		if (options.signedIn) throw redirect({ to: "/settings" });
		return options;
	},
	head: () => ({ meta: [{ title: "Sign in · potli" }] }),
	component: SignInRoute,
});

function SignInRoute() {
	const { github, devSignIn } = Route.useLoaderData();
	const { error } = Route.useSearch();
	return <SignInPage github={github} devSignIn={devSignIn} error={error} />;
}

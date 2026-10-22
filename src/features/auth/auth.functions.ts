import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { isDevSignInEnabled } from "./dev-sign-in";
import { getSessionUser } from "./session";
import { loadSettingsForRequest } from "./settings.server";

export const getSettings = createServerFn({ method: "GET" }).handler(() =>
	loadSettingsForRequest(getRequest().headers),
);

export const getSignInOptions = createServerFn({ method: "GET" }).handler(async () => {
	const user = await getSessionUser(getRequest().headers);
	return {
		signedIn: user !== null,
		github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
		devSignIn: isDevSignInEnabled(env),
	};
});

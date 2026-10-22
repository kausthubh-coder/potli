import { env } from "cloudflare:workers";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { isRegistryPath, registry } from "#/features/registry/registry.api";

// One Worker serves two things: npm clients get the registry API (Hono), browsers get the
// website (TanStack Start). See isRegistryPath for how a request is routed.
export default createServerEntry({
	fetch(request, opts) {
		if (isRegistryPath(new URL(request.url).pathname)) {
			return registry.fetch(request, env);
		}
		return handler.fetch(request, opts);
	},
});

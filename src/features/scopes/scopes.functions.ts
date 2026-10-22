import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { claimScopeForRequest } from "./scopes.server";

export const claimScope = createServerFn({ method: "POST" })
	.validator((input: { name: string }) => {
		if (typeof input?.name !== "string") throw new Error("Expected { name: string }");
		return { name: input.name };
	})
	.handler(({ data }) => claimScopeForRequest(getRequest().headers, data));

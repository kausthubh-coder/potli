import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { createTokenForRequest, revokeTokenForRequest } from "./tokens.server";

export const createPublishToken = createServerFn({ method: "POST" })
	.validator((input: { name: string }) => {
		if (typeof input?.name !== "string") throw new Error("Expected { name: string }");
		return { name: input.name };
	})
	.handler(({ data }) => createTokenForRequest(getRequest().headers, data));

export const revokePublishToken = createServerFn({ method: "POST" })
	.validator((input: { id: string }) => {
		if (typeof input?.id !== "string") throw new Error("Expected { id: string }");
		return { id: input.id };
	})
	.handler(({ data }) => revokeTokenForRequest(getRequest().headers, data));

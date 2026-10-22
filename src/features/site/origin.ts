import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// The origin this page was served from: the registry lives on the same origin, so install
// instructions use it instead of a fixed domain (see docs/decisions.md).
export const getOrigin = createIsomorphicFn()
	.server(() => new URL(getRequest().url).origin)
	.client(() => window.location.origin);

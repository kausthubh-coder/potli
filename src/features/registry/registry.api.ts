import { Hono } from "hono";

// The npm registry API. npm, pnpm, bun and yarn call these routes; the website never does.
// Protocol notes: docs/registry-protocol.md.
export const registry = new Hono<{ Bindings: Env }>();

// `npm ping`
registry.get("/-/ping", (c) => c.json({}));

registry.notFound((c) => c.json({ error: "Not found" }, 404));

// Registry routes are everything under "/@" (scoped packages and their tarballs) and "/-/"
// (npm's special endpoints). The website must not use paths that start with either.
export function isRegistryPath(pathname: string): boolean {
	return pathname.startsWith("/@") || pathname.startsWith("/-/");
}

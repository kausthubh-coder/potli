// Scope rules: which names are valid, which are reserved, and who owns what. The pure checks run
// in the browser too (inline form errors), so this file only imports the db's type, never the db.
import { asc, eq } from "drizzle-orm";

import type { db as Db } from "#/db";
import { scopes } from "#/db/schema";

type Database = typeof Db;

export const MAX_SCOPE_LENGTH = 214;

// Names people would mistake for an official package, plus names potli itself may need.
export const RESERVED_SCOPES: ReadonlySet<string> = new Set([
	// potli and its words
	"potli",
	"admin",
	"administrator",
	"api",
	"www",
	"app",
	"registry",
	"root",
	"system",
	"internal",
	"official",
	"support",
	"help",
	"security",
	"abuse",
	"status",
	"docs",
	"blog",
	"mail",
	"email",
	"static",
	"assets",
	"cdn",
	"settings",
	"login",
	"signin",
	"sign-in",
	"signup",
	"sign-up",
	"auth",
	"oauth",
	// package managers and runtimes
	"npm",
	"npmjs",
	"node",
	"nodejs",
	"deno",
	"bun",
	"oven",
	"jsr",
	"yarn",
	"yarnpkg",
	"pnpm",
	"types",
	"definitelytyped",
	"typescript",
	"openjs",
	"tc39",
	"ecma",
	"whatwg",
	"w3c",
	// frameworks and tools
	"react",
	"vue",
	"angular",
	"svelte",
	"sveltejs",
	"next",
	"nextjs",
	"nuxt",
	"remix",
	"astro",
	"solid",
	"solidjs",
	"tanstack",
	"vite",
	"vitejs",
	"vitest",
	"webpack",
	"rollup",
	"esbuild",
	"swc",
	"babel",
	"eslint",
	"prettier",
	"biome",
	"jest",
	"expo",
	"prisma",
	"drizzle",
	"hono",
	"trpc",
	// companies
	"vercel",
	"cloudflare",
	"google",
	"microsoft",
	"github",
	"gitlab",
	"anthropic",
	"claude",
	"openai",
	"apple",
	"meta",
	"facebook",
	"amazon",
	"aws",
	"azure",
	"netlify",
	"supabase",
	"stripe",
	"shopify",
	"docker",
	"mozilla",
]);

export type ScopeNameCheck =
	| { ok: true; name: string }
	| {
			ok: false;
			reason: "empty" | "too-long" | "uppercase" | "leading-dot-or-underscore" | "characters" | "reserved";
			message: string;
	  };

// npm's rules for the `@scope` part of a name: lowercase, url-safe, no leading "." or "_".
export function checkScopeName(input: string): ScopeNameCheck {
	// People type the "@" because that's how they see scopes written.
	const name = input.trim().replace(/^@/, "");
	if (name === "") return { ok: false, reason: "empty", message: "Enter a scope name" };
	if (name.length > MAX_SCOPE_LENGTH) {
		return { ok: false, reason: "too-long", message: `Use ${MAX_SCOPE_LENGTH} characters or fewer` };
	}
	if (name.startsWith(".") || name.startsWith("_")) {
		return { ok: false, reason: "leading-dot-or-underscore", message: "Can't start with “.” or “_”" };
	}
	if (!/^[a-z0-9._-]+$/i.test(name)) {
		return {
			ok: false,
			reason: "characters",
			message: "Use only lowercase letters, digits, “-”, “.” and “_”",
		};
	}
	// Checked after the characters, so the suggested fix is always a valid name.
	if (name !== name.toLowerCase()) {
		return { ok: false, reason: "uppercase", message: `Use lowercase letters: @${name.toLowerCase()}` };
	}
	if (RESERVED_SCOPES.has(name)) return { ok: false, reason: "reserved", message: `@${name} is reserved` };
	return { ok: true, name };
}

export type ScopeAvailability =
	| { ok: true; name: string }
	| (Extract<ScopeNameCheck, { ok: false }> & { name: string })
	| { ok: false; reason: "taken" | "yours"; message: string; name: string };

// The free check: valid, not reserved, and nobody owns it yet.
export async function checkScopeAvailable(
	db: Database,
	userId: string,
	input: string,
): Promise<ScopeAvailability> {
	const checked = checkScopeName(input);
	const name = input.trim().replace(/^@/, "");
	if (!checked.ok) return { ...checked, name };
	const [owner] = await db
		.select({ ownerId: scopes.ownerId })
		.from(scopes)
		.where(eq(scopes.name, checked.name))
		.limit(1);
	if (!owner) return { ok: true, name: checked.name };
	if (owner.ownerId === userId) {
		return { ok: false, reason: "yours", message: `You already own @${checked.name}`, name: checked.name };
	}
	return { ok: false, reason: "taken", message: `@${checked.name} is already taken`, name: checked.name };
}

export async function claimOrgScope(db: Database, userId: string, input: string): Promise<ScopeAvailability> {
	const available = await checkScopeAvailable(db, userId, input);
	if (!available.ok) return available;
	// Two people can pass the check at once; the primary key decides who gets it.
	const inserted = await db
		.insert(scopes)
		.values({ name: available.name, ownerId: userId, kind: "org" })
		.onConflictDoNothing()
		.returning({ name: scopes.name });
	if (inserted.length === 0) return checkScopeAvailable(db, userId, available.name);
	return available;
}

// Runs once, when an account is created. The account works either way: if the name is reserved or
// taken, the user just has no user scope and settings says why.
export async function createUserScope(
	db: Database,
	user: { id: string; username?: string | null },
): Promise<boolean> {
	if (!user.username) return false;
	const checked = checkScopeName(user.username);
	if (!checked.ok) return false;
	const inserted = await db
		.insert(scopes)
		.values({ name: checked.name, ownerId: user.id, kind: "user" })
		.onConflictDoNothing()
		.returning({ name: scopes.name });
	return inserted.length === 1;
}

export type OwnedScope = { name: string; kind: "user" | "org"; createdAt: number };

export async function listScopes(db: Database, userId: string): Promise<OwnedScope[]> {
	const rows = await db
		.select({ name: scopes.name, kind: scopes.kind, createdAt: scopes.createdAt })
		.from(scopes)
		.where(eq(scopes.ownerId, userId))
		.orderBy(asc(scopes.createdAt), asc(scopes.name));
	// The user scope first, then org scopes in the order they were claimed.
	return rows
		.map((row) => ({ name: row.name, kind: row.kind, createdAt: row.createdAt.getTime() }))
		.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "user" ? -1 : 1));
}

// Whether the user owns the scope named after their login, and why not, for the settings page.
export type UserScopeStatus =
	| { status: "owned"; name: string }
	| { status: "missing"; name: string; reason: "reserved" | "taken" | "invalid" | "no-username" };

export async function ensureUserScope(
	db: Database,
	user: { id: string; username?: string | null },
): Promise<UserScopeStatus> {
	if (!user.username) return { status: "missing", name: "", reason: "no-username" };
	const name = user.username;
	const checked = checkScopeName(name);
	if (!checked.ok) {
		return { status: "missing", name, reason: checked.reason === "reserved" ? "reserved" : "invalid" };
	}
	// Accounts made before scopes existed, or whose hook failed, get their scope here if it's free.
	await createUserScope(db, user);
	const [row] = await db
		.select({ ownerId: scopes.ownerId })
		.from(scopes)
		.where(eq(scopes.name, name))
		.limit(1);
	if (row?.ownerId === user.id) return { status: "owned", name };
	return { status: "missing", name, reason: "taken" };
}

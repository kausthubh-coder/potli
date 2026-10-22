// Publish tokens in the database. Uses the shared contract in tokens.logic.ts: the raw token is
// returned once, to show the user, and only its hash is stored.
import { and, desc, eq } from "drizzle-orm";

import type { db as Db } from "#/db";
import { tokens } from "#/db/schema";
import { generateToken, hashToken } from "./tokens.logic";

type Database = typeof Db;

export const MAX_TOKEN_NAME_LENGTH = 64;

export type TokenNameCheck = { ok: true; name: string } | { ok: false; message: string };

// Pure, so the form can show the same errors before it sends anything.
export function checkTokenName(input: string): TokenNameCheck {
	const name = input.trim();
	if (name === "") return { ok: false, message: "Enter a token name" };
	if (name.length > MAX_TOKEN_NAME_LENGTH) {
		return { ok: false, message: `Use ${MAX_TOKEN_NAME_LENGTH} characters or fewer` };
	}
	return { ok: true, name };
}

export type TokenSummary = { id: string; name: string; createdAt: number; lastUsedAt: number | null };

export async function listTokens(db: Database, userId: string): Promise<TokenSummary[]> {
	const rows = await db
		.select({ id: tokens.id, name: tokens.name, createdAt: tokens.createdAt, lastUsedAt: tokens.lastUsedAt })
		.from(tokens)
		.where(eq(tokens.userId, userId))
		.orderBy(desc(tokens.createdAt));
	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		createdAt: row.createdAt.getTime(),
		lastUsedAt: row.lastUsedAt?.getTime() ?? null,
	}));
}

export type CreatedToken =
	| { ok: true; token: string; summary: TokenSummary }
	| { ok: false; message: string };

export async function createToken(db: Database, userId: string, input: string): Promise<CreatedToken> {
	const checked = checkTokenName(input);
	if (!checked.ok) return checked;
	const [sameName] = await db
		.select({ id: tokens.id })
		.from(tokens)
		.where(and(eq(tokens.userId, userId), eq(tokens.name, checked.name)))
		.limit(1);
	if (sameName) return { ok: false, message: `You already have a token named “${checked.name}”` };

	const token = generateToken();
	const [row] = await db
		.insert(tokens)
		.values({ id: crypto.randomUUID(), userId, name: checked.name, tokenHash: await hashToken(token) })
		.returning({ id: tokens.id, name: tokens.name, createdAt: tokens.createdAt });
	if (!row) return { ok: false, message: "Couldn't save the token. Try again." };
	return {
		ok: true,
		token,
		summary: { id: row.id, name: row.name, createdAt: row.createdAt.getTime(), lastUsedAt: null },
	};
}

// Deletes only a token the user owns. Returns false when there was no such token for this user,
// whether it doesn't exist or belongs to someone else.
export async function revokeToken(db: Database, userId: string, tokenId: string): Promise<boolean> {
	const deleted = await db
		.delete(tokens)
		.where(and(eq(tokens.id, tokenId), eq(tokens.userId, userId)))
		.returning({ id: tokens.id });
	return deleted.length === 1;
}

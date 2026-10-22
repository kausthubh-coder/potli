// Pure helpers for package search. Tested in search.test.ts.

const MAX_QUERY_LENGTH = 100;

/** The query as searched: trimmed, inner whitespace collapsed, capped, lowercased. */
export function normalizeQuery(raw: unknown): string {
	if (typeof raw !== "string") return "";
	return raw.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH).toLowerCase();
}

/** A LIKE pattern matching `query` anywhere, with LIKE's own wildcards escaped by "\". */
export function containsPattern(query: string): string {
	return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * How well a package matches, lower is better: the exact name, then the name after the scope,
 * then a name that starts with the query, then any name match, then the description.
 */
export function matchRank(q: string, name: string, description: string | null): number {
	const short = name.slice(name.indexOf("/") + 1);
	if (name === q || name === `@${q}`) return 0;
	if (short === q) return 1;
	if (short.startsWith(q) || name.startsWith(q) || name.startsWith(`@${q}`)) return 2;
	if (name.includes(q)) return 3;
	if (description?.toLowerCase().includes(q)) return 4;
	return 5;
}

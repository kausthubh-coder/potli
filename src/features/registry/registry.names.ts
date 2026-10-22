// Package names and the URLs built from them. Only scoped names exist (docs/decisions.md).

export type PackageName = {
	full: string; // "@scope/name"
	scope: string; // "scope", without the "@"
	base: string; // "name"
};

// npm's own rule for new package names: lowercase and URL-safe, no leading "." or "_".
const PACKAGE_NAME = /^@([a-z0-9~-][a-z0-9._~-]*)\/([a-z0-9~-][a-z0-9._~-]*)$/;

export function parsePackageName(full: string): PackageName | null {
	const match = full.match(PACKAGE_NAME);
	if (!match || full.length > 214) return null;
	const [, scope, base] = match;
	return { full, scope, base };
}

// Same file name npmjs uses: "@scope/name" version "1.2.0" is "name-1.2.0.tgz".
export function tarballFileName(name: PackageName, version: string): string {
	return `${name.base}-${version}.tgz`;
}

export function tarballUrl(origin: string, name: PackageName, version: string): string {
	return `${origin}/${name.full}/-/${tarballFileName(name, version)}`;
}

// Clients send "/@scope%2fname" (npm, bun), "/@scope%2Fname" (pnpm) or "/@scope/name". Routes
// match the plain form, so the encoded slash after the scope is decoded before routing. Hono's
// default path already applies decodeURI, which leaves "%2f" alone.
export function decodeScopedSlash(path: string): string {
	return path.replace(/^(\/(?:-\/package\/)?@[^/%]+)%2f/i, "$1/");
}

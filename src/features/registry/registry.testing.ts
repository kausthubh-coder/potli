// Test helpers for the npm API: a user with a publish token, and the exact request `npm publish`
// sends. Only imported by *.test.ts files.
import { Buffer } from "node:buffer";

import { db } from "#/db";
import { scopes, tokens, user } from "#/db/schema";
import { generateToken, hashToken } from "#/features/tokens/tokens.logic";
import { registry } from "./registry.api";

// A user who owns the scope matching their username and has one publish token.
export async function seedUser(username: string) {
	const id = `user-${username}`;
	const token = generateToken();
	await db.insert(user).values({ id, name: username, email: `${username}@example.com`, username });
	await db.insert(scopes).values({ name: username, ownerId: id, kind: "user" });
	await db
		.insert(tokens)
		.values({ id: `token-${username}`, userId: id, name: "laptop", tokenHash: await hashToken(token) });
	return { id, username, token };
}

export function randomTarball(size = 4096): Uint8Array<ArrayBuffer> {
	return crypto.getRandomValues(new Uint8Array(size));
}

// The body `npm publish` sends (libnpmpublish): one version, its tarball as a base64 attachment
// keyed "@scope/name-1.0.0.tgz", and dist.tarball pointing wherever the client thinks it goes.
export async function publishBody(
	name: string,
	version: string,
	tarball: Uint8Array<ArrayBuffer>,
	options: { tags?: Record<string, string>; description?: string } = {},
) {
	const integrity = `sha512-${Buffer.from(await crypto.subtle.digest("SHA-512", tarball)).toString("base64")}`;
	const shasum = Buffer.from(await crypto.subtle.digest("SHA-1", tarball)).toString("hex");
	const description = options.description ?? "A test package";
	return {
		_id: name,
		name,
		description,
		"dist-tags": options.tags ?? { latest: version },
		versions: {
			[version]: {
				name,
				version,
				description,
				dependencies: { hono: "^4.0.0" },
				_id: `${name}@${version}`,
				dist: { integrity, shasum, tarball: `http://localhost:3455/${name}/-/${name}-${version}.tgz` },
			},
		},
		readme: `# ${name} ${version}`,
		_attachments: {
			[`${name}-${version}.tgz`]: {
				content_type: "application/octet-stream",
				data: Buffer.from(tarball).toString("base64"),
				length: tarball.byteLength,
			},
		},
	};
}

export function put(path: string, body: unknown, token?: string) {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (token) headers.Authorization = `Bearer ${token}`;
	return registry.request(path, { method: "PUT", headers, body: JSON.stringify(body) });
}

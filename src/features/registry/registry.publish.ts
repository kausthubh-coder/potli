import { env } from "cloudflare:workers";
import { Buffer } from "node:buffer";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";

import { db } from "#/db";
import { distTags, packages, versions } from "#/db/schema";
import { authenticate, scopeOwnershipError, unauthorizedMessage } from "./registry.auth";
import type { PackageName } from "./registry.names";

export const MAX_TARBALL_BYTES = 10 * 1024 * 1024;
// A 10 MB tarball is about 13.4 MB as base64, plus the manifest and readme.
export const MAX_PUBLISH_BODY_BYTES = 16 * 1024 * 1024;

// semver.org's regex for a valid version.
const SEMVER =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

// `npm publish`: PUT /@scope%2fname with one version and its tarball as a base64 attachment.
// Every check runs before anything is written; the order is the one docs/registry-protocol.md lists.
// Error messages are printed by npm, so each one says what to do.
export async function publish(c: Context, name: PackageName): Promise<Response> {
	const publisher = await authenticate(c.req.header("Authorization"));
	if (!publisher) return c.json({ error: unauthorizedMessage(c.req.url, "publish") }, 401);

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		body = null;
	}
	if (!isRecord(body)) {
		return c.json({ error: "The publish body is not JSON. Publish with npm, pnpm, bun or yarn." }, 400);
	}

	const versionEntries = isRecord(body.versions) ? Object.entries(body.versions) : [];
	const attachments = isRecord(body._attachments) ? Object.values(body._attachments) : [];
	if (versionEntries.length !== 1 || attachments.length !== 1) {
		return c.json({ error: "Publish exactly one version and its tarball at a time." }, 400);
	}
	const [[version, manifest]] = versionEntries;
	const [attachment] = attachments;
	if (!isRecord(manifest) || !isRecord(attachment)) {
		return c.json({ error: "The publish body is malformed. Publish with npm, pnpm, bun or yarn." }, 400);
	}

	const namesAgree =
		body.name === name.full && manifest.name === name.full && (body._id ?? name.full) === name.full;
	if (!namesAgree) {
		return c.json(
			{ error: `The name in package.json must be ${name.full}, the package you are publishing to.` },
			400,
		);
	}

	const ownershipError = await scopeOwnershipError(publisher.id, name.scope);
	if (ownershipError) return c.json({ error: ownershipError }, 403);

	if (manifest.version !== version || !SEMVER.test(version)) {
		return c.json(
			{
				error: `"${version}" is not a valid semver version. Set "version" in package.json to one like 1.0.0.`,
			},
			400,
		);
	}

	const [[existingPackage], [existingVersion]] = await db.batch([
		db.select({ name: packages.name }).from(packages).where(eq(packages.name, name.full)),
		db
			.select({ version: versions.version })
			.from(versions)
			.where(and(eq(versions.packageName, name.full), eq(versions.version, version))),
	]);
	if (existingVersion) return versionExists(c, name, version);

	const dist = isRecord(manifest.dist) ? manifest.dist : {};
	const { integrity, shasum } = dist;
	const data = attachment.data;
	if (typeof integrity !== "string" || typeof shasum !== "string" || typeof data !== "string") {
		return c.json(
			{ error: "The publish is missing the tarball or its integrity. Publish with npm, pnpm, bun or yarn." },
			400,
		);
	}

	// Checked on the base64 length first so an oversized tarball is never decoded.
	const tooLarge = () =>
		c.json(
			{
				error: `The tarball is over the 10 MB limit. Leave files out with "files" in package.json or .npmignore.`,
			},
			413,
		);
	if (Math.floor((data.length * 3) / 4) > MAX_TARBALL_BYTES + 2) return tooLarge();
	const tarball = Buffer.from(data, "base64");
	if (tarball.byteLength > MAX_TARBALL_BYTES) return tooLarge();

	const sha512 = `sha512-${Buffer.from(await crypto.subtle.digest("SHA-512", tarball)).toString("base64")}`;
	const sha1 = Buffer.from(await crypto.subtle.digest("SHA-1", tarball)).toString("hex");
	if (integrity !== sha512 || shasum !== sha1) {
		return c.json(
			{
				error:
					"The tarball does not match its integrity or shasum. It was corrupted on the way; publish again.",
			},
			400,
		);
	}

	const bodyTags = isRecord(body["dist-tags"]) ? body["dist-tags"] : {};
	const tags = Object.keys(bodyTags).length > 0 ? bodyTags : { latest: version };
	if (Object.values(tags).some((tagged) => tagged !== version)) {
		return c.json(
			{ error: `A publish can only tag the version it publishes (${version}). Use npm dist-tag for others.` },
			400,
		);
	}

	// The key includes the sha1 so a retried or racing publish of the same version never
	// overwrites the bytes D1 points at: only one D1 insert can win, and it names its own object.
	const tarballKey = `${name.full}/${version}/${sha1}.tgz`;
	await env.TARBALLS.put(tarballKey, tarball, { httpMetadata: { contentType: "application/octet-stream" } });

	// The package page shows the latest version's description and readme.
	const description = optionalString(body.description) ?? optionalString(manifest.description);
	const readme = optionalString(body.readme) ?? optionalString(manifest.readme);
	const showsThisVersion = !existingPackage || "latest" in tags;
	const now = new Date();
	const { tarball: _clientTarballUrl, ...storedDist } = dist;

	try {
		await db.batch([
			db
				.insert(packages)
				.values({ name: name.full, scope: name.scope, description, readme })
				.onConflictDoUpdate({
					target: packages.name,
					set: showsThisVersion ? { description, readme, updatedAt: now } : { updatedAt: now },
				}),
			db.insert(versions).values({
				packageName: name.full,
				version,
				manifest: { ...manifest, dist: storedDist },
				tarballKey,
				integrity: sha512,
				shasum: sha1,
				size: tarball.byteLength,
				publishedBy: publisher.id,
			}),
			...Object.keys(tags).map((tag) =>
				db
					.insert(distTags)
					.values({ packageName: name.full, tag, version })
					.onConflictDoUpdate({ target: [distTags.packageName, distTags.tag], set: { version } }),
			),
		]);
	} catch (error) {
		// Another publish of the same version won the race between the check above and this write.
		if (String(error).includes("UNIQUE constraint failed: versions")) return versionExists(c, name, version);
		throw error;
	}

	return c.json({ ok: true }, 201);
}

function versionExists(c: Context, name: PackageName, version: string): Response {
	return c.json(
		{
			error: `${name.full}@${version} is already published, and published versions never change. Bump "version" in package.json and publish again.`,
		},
		409,
	);
}

// Reports and takedowns. Server-only: server functions in moderation.functions.ts call these with
// the request's headers, so tests can call them without the TanStack Start runtime.
import { env } from "cloudflare:workers";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { db } from "#/db";
import { distTags, packages, reports, user, versions } from "#/db/schema";
import { getSessionUser, type SessionUser } from "#/features/auth/session";
import { compareVersions, isPrerelease } from "#/features/packages/packages.logic";
import { isRecord } from "#/features/registry/registry.publish";
import { ipSubject, rateLimit, tryAgainIn } from "#/lib/rate-limit";
import {
	checkReport,
	isAdmin,
	type ReportInput,
	type ReportReason,
	type ReportStatus,
} from "./moderation.logic";

export type ModerationResult = { ok: true } | { ok: false; message: string };

// Anyone can report, signed in or not. The limit is per IP address, so signing out doesn't reset it.
export async function submitReportForRequest(
	headers: Headers,
	input: ReportInput,
): Promise<ModerationResult> {
	const checked = checkReport(input);
	if (!checked.ok) return checked;
	const limited = await rateLimit("report", await ipSubject(headers));
	if (limited) {
		return {
			ok: false,
			message: `potli takes ${limited.max} reports an hour from one network. Try again ${tryAgainIn(limited.retryAfterSeconds)}.`,
		};
	}

	const pkg = await db
		.select({ takenDownAt: packages.takenDownAt })
		.from(packages)
		.where(eq(packages.name, checked.packageName))
		.get();
	if (!pkg) return { ok: false, message: `There's no package named ${checked.packageName}.` };
	if (pkg.takenDownAt) return { ok: false, message: `${checked.packageName} was already taken down.` };
	if (checked.version !== null) {
		const row = await db
			.select({ takenDownAt: versions.takenDownAt })
			.from(versions)
			.where(and(eq(versions.packageName, checked.packageName), eq(versions.version, checked.version)))
			.get();
		if (!row) return { ok: false, message: `${checked.packageName}@${checked.version} isn't published.` };
		if (row.takenDownAt) {
			return { ok: false, message: `${checked.packageName}@${checked.version} was already taken down.` };
		}
	}

	const reporter = await getSessionUser(headers);
	await db.insert(reports).values({
		id: crypto.randomUUID(),
		packageName: checked.packageName,
		version: checked.version,
		reason: checked.reason,
		details: checked.details,
		reporterId: reporter?.id ?? null,
	});
	return { ok: true };
}

// The session's user when their GitHub login is in ADMIN_LOGINS, else null.
async function sessionAdmin(headers: Headers): Promise<SessionUser | null> {
	const sessionUser = await getSessionUser(headers);
	return sessionUser && isAdmin(sessionUser.username, env.ADMIN_LOGINS) ? sessionUser : null;
}

export async function isAdminRequest(headers: Headers): Promise<boolean> {
	return (await sessionAdmin(headers)) !== null;
}

const NOT_ADMIN: ModerationResult = { ok: false, message: "Only potli's admins can do that." };

export type ReportView = {
	id: string;
	packageName: string;
	version: string | null;
	reason: ReportReason;
	details: string;
	reporter: string | null; // GitHub login, or null when signed out
	status: ReportStatus;
	createdAt: Date;
	resolvedAt: Date | null;
	packageTakenDown: boolean;
	versionTakenDown: boolean;
};

const RESOLVED_SHOWN = 30;

// The admin page: every open report, oldest first, and the latest resolved ones. Null for anyone
// who isn't an admin, so the page can 404 for them.
export async function loadReportsForRequest(
	headers: Headers,
): Promise<{ open: ReportView[]; resolved: ReportView[] } | null> {
	if (!(await sessionAdmin(headers))) return null;
	const query = () =>
		db
			.select({
				id: reports.id,
				packageName: reports.packageName,
				version: reports.version,
				reason: reports.reason,
				details: reports.details,
				reporter: user.username,
				status: reports.status,
				createdAt: reports.createdAt,
				resolvedAt: reports.resolvedAt,
				packageTakenDownAt: packages.takenDownAt,
				versionTakenDownAt: versions.takenDownAt,
			})
			.from(reports)
			.innerJoin(packages, eq(packages.name, reports.packageName))
			.leftJoin(
				versions,
				and(eq(versions.packageName, reports.packageName), eq(versions.version, reports.version)),
			)
			.leftJoin(user, eq(user.id, reports.reporterId));
	// Not db.batch: batch results are keyed by column name, and packages and versions both have
	// taken_down_at, so one would overwrite the other.
	const [open, resolved] = await Promise.all([
		query().where(eq(reports.status, "open")).orderBy(asc(reports.createdAt)),
		query().where(ne(reports.status, "open")).orderBy(desc(reports.resolvedAt)).limit(RESOLVED_SHOWN),
	]);
	const view = ({ packageTakenDownAt, versionTakenDownAt, ...row }: (typeof open)[number]): ReportView => ({
		...row,
		packageTakenDown: packageTakenDownAt !== null,
		versionTakenDown: versionTakenDownAt !== null,
	});
	return { open: open.map(view), resolved: resolved.map(view) };
}

export async function dismissReportForRequest(
	headers: Headers,
	input: { id: string },
): Promise<ModerationResult> {
	const admin = await sessionAdmin(headers);
	if (!admin) return NOT_ADMIN;
	const updated = await db
		.update(reports)
		.set({ status: "dismissed", resolvedAt: new Date(), resolvedBy: admin.id })
		.where(and(eq(reports.id, input.id), eq(reports.status, "open")))
		.returning({ id: reports.id });
	return updated.length === 1 ? { ok: true } : { ok: false, message: "That report is already resolved." };
}

// Takes down one version, or the whole package when version is null. Nothing is deleted: the rows
// stay so the name and version numbers can never be published again, and the tarballs stay in R2.
// Open reports about what was taken down are resolved with it.
export async function takeDownForRequest(
	headers: Headers,
	input: { packageName: string; version: string | null },
): Promise<ModerationResult> {
	const admin = await sessionAdmin(headers);
	if (!admin) return NOT_ADMIN;
	return input.version === null
		? takeDownPackage(admin.id, input.packageName)
		: takeDownVersion(admin.id, input.packageName, input.version);
}

async function takeDownPackage(adminId: string, packageName: string): Promise<ModerationResult> {
	const pkg = await db
		.select({ takenDownAt: packages.takenDownAt })
		.from(packages)
		.where(eq(packages.name, packageName))
		.get();
	if (!pkg) return { ok: false, message: `There's no package named ${packageName}.` };
	if (pkg.takenDownAt) return { ok: false, message: `${packageName} is already taken down.` };
	const now = new Date();
	await db.batch([
		db
			.update(packages)
			.set({ takenDownAt: now, takenDownBy: adminId, updatedAt: now })
			.where(eq(packages.name, packageName)),
		db
			.update(reports)
			.set({ status: "removed", resolvedAt: now, resolvedBy: adminId })
			.where(and(eq(reports.packageName, packageName), eq(reports.status, "open"))),
	]);
	return { ok: true };
}

async function takeDownVersion(
	adminId: string,
	packageName: string,
	version: string,
): Promise<ModerationResult> {
	const [[pkg], versionRows, tagRows] = await db.batch([
		db.select({ takenDownAt: packages.takenDownAt }).from(packages).where(eq(packages.name, packageName)),
		db
			.select({ version: versions.version, manifest: versions.manifest, takenDownAt: versions.takenDownAt })
			.from(versions)
			.where(eq(versions.packageName, packageName)),
		db
			.select({ tag: distTags.tag, version: distTags.version })
			.from(distTags)
			.where(eq(distTags.packageName, packageName)),
	]);
	if (!pkg) return { ok: false, message: `There's no package named ${packageName}.` };
	if (pkg.takenDownAt) return { ok: false, message: `${packageName} is already taken down.` };
	const target = versionRows.find((row) => row.version === version);
	if (!target) return { ok: false, message: `${packageName}@${version} isn't published.` };
	if (target.takenDownAt) return { ok: false, message: `${packageName}@${version} is already taken down.` };

	// Tags on the taken-down version go. `latest` must keep pointing at an installable version, so
	// it moves to the newest one left, a release before a prerelease.
	const left = versionRows
		.filter((row) => row.takenDownAt === null && row.version !== version)
		.sort((a, b) => compareVersions(b.version, a.version));
	const latestMoves = tagRows.some((row) => row.tag === "latest" && row.version === version);
	const newLatest = latestMoves ? (left.find((row) => !isPrerelease(row.version)) ?? left[0] ?? null) : null;
	const now = new Date();

	const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
		db
			.update(versions)
			.set({ takenDownAt: now, takenDownBy: adminId })
			.where(and(eq(versions.packageName, packageName), eq(versions.version, version))),
		db.delete(distTags).where(and(eq(distTags.packageName, packageName), eq(distTags.version, version))),
		db
			.update(reports)
			.set({ status: "removed", resolvedAt: now, resolvedBy: adminId })
			.where(
				and(eq(reports.packageName, packageName), eq(reports.version, version), eq(reports.status, "open")),
			),
	];
	if (latestMoves) {
		// The package page shows latest's description and readme, which may be what was reported.
		const manifest = newLatest && isRecord(newLatest.manifest) ? newLatest.manifest : {};
		statements.push(
			db
				.update(packages)
				.set({
					description: typeof manifest.description === "string" ? manifest.description : null,
					readme: typeof manifest.readme === "string" ? manifest.readme : null,
					updatedAt: now,
				})
				.where(eq(packages.name, packageName)),
		);
		if (newLatest) {
			statements.push(db.insert(distTags).values({ packageName, tag: "latest", version: newLatest.version }));
		}
	} else {
		statements.push(db.update(packages).set({ updatedAt: now }).where(eq(packages.name, packageName)));
	}
	await db.batch(statements);
	return { ok: true };
}

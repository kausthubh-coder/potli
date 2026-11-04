// Report rules and who counts as an admin. Pure, so the report form runs the same checks before it
// sends anything; it imports only types from the schema.
import type { reports } from "#/db/schema";
import { parseAllowlist } from "#/features/auth/signup.logic";

export type ReportReason = (typeof reports.$inferSelect)["reason"];
export type ReportStatus = (typeof reports.$inferSelect)["status"];

// In the order the form lists them. The Record type makes a new schema reason fail to compile here.
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
	malware: "Malware or harmful code",
	spam: "Spam or junk",
	impersonation: "Pretends to be someone else, or squats a name",
	legal: "Copyright, license or other legal problem",
	other: "Something else",
};

export const REPORT_REASONS = Object.keys(REPORT_REASON_LABELS) as ReportReason[];

export const MAX_REPORT_DETAILS = 2000;

export type ReportInput = { packageName: string; version: string | null; reason: string; details: string };

export type CheckedReport =
	| { ok: true; packageName: string; version: string | null; reason: ReportReason; details: string }
	| { ok: false; message: string };

function isReportReason(value: string): value is ReportReason {
	return (REPORT_REASONS as string[]).includes(value);
}

export function checkReport(input: ReportInput): CheckedReport {
	if (!isReportReason(input.reason)) return { ok: false, message: "Pick a reason" };
	const details = input.details.trim();
	if (details.length > MAX_REPORT_DETAILS) {
		return { ok: false, message: `Use ${MAX_REPORT_DETAILS} characters or fewer` };
	}
	if (input.reason === "other" && details === "") {
		return { ok: false, message: "Say what's wrong with this package" };
	}
	return { ok: true, packageName: input.packageName, version: input.version, reason: input.reason, details };
}

// ADMIN_LOGINS is comma-separated GitHub logins. Unlike SIGNUP_ALLOWLIST, "*" means nobody: no
// GitHub login is "*".
export function isAdmin(username: string | null, adminLogins: string | undefined): boolean {
	if (!username) return false;
	return parseAllowlist(adminLogins).has(username.toLowerCase());
}

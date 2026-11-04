import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import type { ReportInput } from "./moderation.logic";
import {
	dismissReportForRequest,
	loadReportsForRequest,
	submitReportForRequest,
	takeDownForRequest,
} from "./moderation.server";

function stringOrNull(value: unknown): string | null {
	return typeof value === "string" && value !== "" ? value : null;
}

export const submitReport = createServerFn({ method: "POST" })
	.validator((input: ReportInput): ReportInput => {
		if (typeof input?.packageName !== "string" || typeof input.reason !== "string") {
			throw new Error("Expected { packageName, version, reason, details }");
		}
		return {
			packageName: input.packageName,
			version: stringOrNull(input.version),
			reason: input.reason,
			details: typeof input.details === "string" ? input.details : "",
		};
	})
	.handler(({ data }) => submitReportForRequest(getRequest().headers, data));

export const getAdminReports = createServerFn({ method: "GET" }).handler(() =>
	loadReportsForRequest(getRequest().headers),
);

export const dismissReport = createServerFn({ method: "POST" })
	.validator((input: { id: string }) => {
		if (typeof input?.id !== "string") throw new Error("Expected { id: string }");
		return { id: input.id };
	})
	.handler(({ data }) => dismissReportForRequest(getRequest().headers, data));

export const takeDown = createServerFn({ method: "POST" })
	.validator((input: { packageName: string; version: string | null }) => {
		if (typeof input?.packageName !== "string") throw new Error("Expected { packageName, version }");
		return { packageName: input.packageName, version: stringOrNull(input.version) };
	})
	.handler(({ data }) => takeDownForRequest(getRequest().headers, data));

// /admin: reports for potli's admins (ADMIN_LOGINS). Everyone else gets the 404 page.
import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { formatDate, timeAgo } from "#/features/packages/packages.logic";
import { dangerButton, fieldError, secondaryButton } from "#/lib/form-styles";
import { dismissReport, takeDown } from "./moderation.functions";
import { REPORT_REASON_LABELS } from "./moderation.logic";
import type { ReportView } from "./moderation.server";

export type AdminData = { open: ReportView[]; resolved: ReportView[]; renderedAt: Date };

export function AdminPage({ data }: { data: AdminData }) {
	return (
		<main className="mx-auto w-full max-w-3xl px-4 pt-12 pb-24 sm:pt-16">
			<h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
			<p className="mt-1 text-muted-foreground">
				Taking something down hides it from npm and the website at once. Its rows and tarballs stay, so its
				version numbers can't be published again.
			</p>

			<section aria-labelledby="open-heading" className="mt-10">
				<h2 id="open-heading" className="font-medium">
					Open <span className="text-muted-foreground tabular-nums">{data.open.length}</span>
				</h2>
				{data.open.length === 0 ? (
					<p className="mt-3 rounded-xl border border-dashed px-6 py-8 text-center text-muted-foreground">
						No open reports.
					</p>
				) : (
					<ul className="mt-3 space-y-4">
						{data.open.map((report) => (
							<li key={report.id}>
								<OpenReport report={report} now={data.renderedAt} />
							</li>
						))}
					</ul>
				)}
			</section>

			<section aria-labelledby="resolved-heading" className="mt-14">
				<h2 id="resolved-heading" className="font-medium">
					Resolved
				</h2>
				{data.resolved.length === 0 ? (
					<p className="mt-3 text-muted-foreground">Nothing resolved yet.</p>
				) : (
					<table className="mt-3 w-full text-sm">
						<thead className="sr-only sm:not-sr-only">
							<tr className="border-b text-left text-muted-foreground">
								<th className="py-2 pr-4 font-normal">Package</th>
								<th className="py-2 pr-4 font-normal">Reason</th>
								<th className="py-2 pr-4 font-normal">Outcome</th>
								<th className="py-2 text-right font-normal">Resolved</th>
							</tr>
						</thead>
						<tbody className="divide-y">
							{data.resolved.map((report) => (
								<tr key={report.id}>
									<td className="py-2.5 pr-4 font-mono text-[0.8125rem] break-all">
										{report.packageName}
										{report.version ? `@${report.version}` : ""}
									</td>
									<td className="py-2.5 pr-4 text-muted-foreground">{REPORT_REASON_LABELS[report.reason]}</td>
									<td className="py-2.5 pr-4">{report.status === "removed" ? "Taken down" : "Dismissed"}</td>
									<td className="py-2.5 text-right text-muted-foreground tabular-nums">
										{report.resolvedAt ? formatDate(report.resolvedAt) : ""}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</section>
		</main>
	);
}

function OpenReport({ report, now }: { report: ReportView; now: Date }) {
	const router = useRouter();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const target = report.version ? `${report.packageName}@${report.version}` : report.packageName;

	const act = async (run: () => Promise<{ ok: true } | { ok: false; message: string }>) => {
		setPending(true);
		setError(null);
		try {
			const result = await run();
			if (!result.ok) setError(result.message);
			await router.invalidate();
		} catch {
			setError("That didn't go through. Reload and try again.");
		} finally {
			setPending(false);
		}
	};

	const [scope, name] = report.packageName.slice(1).split("/");
	return (
		<article aria-label={`Report about ${target}`} className="rounded-xl border bg-card p-5">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h3 className="font-mono text-[0.9375rem] break-all">
					<Link
						to="/package/$scope/$name"
						params={{ scope: `@${scope}`, name }}
						className="hover:text-primary"
					>
						{report.packageName}
					</Link>
					<span className="text-muted-foreground">
						{report.version ? `@${report.version}` : " (all versions)"}
					</span>
				</h3>
				<p className="text-sm text-muted-foreground" title={formatDate(report.createdAt)}>
					{timeAgo(report.createdAt, now)} by {report.reporter ? `@${report.reporter}` : "someone signed out"}
				</p>
			</div>
			<p className="mt-2 text-sm font-medium">{REPORT_REASON_LABELS[report.reason]}</p>
			{report.details ? (
				<p className="mt-1 text-sm whitespace-pre-wrap break-words text-muted-foreground">{report.details}</p>
			) : null}
			{report.packageTakenDown || report.versionTakenDown ? (
				<p className="mt-2 text-sm">
					{report.packageTakenDown ? "The whole package" : "This version"} is already taken down.
				</p>
			) : null}

			<div className="mt-4 flex flex-wrap gap-2">
				{report.version && !report.versionTakenDown && !report.packageTakenDown ? (
					<button
						type="button"
						className={dangerButton}
						disabled={pending}
						onClick={() => {
							if (!window.confirm(`Take down ${target}? This can't be undone from the website.`)) return;
							void act(() =>
								takeDown({ data: { packageName: report.packageName, version: report.version } }),
							);
						}}
					>
						Take down {report.version}
					</button>
				) : null}
				{report.packageTakenDown ? null : (
					<button
						type="button"
						className={dangerButton}
						disabled={pending}
						onClick={() => {
							if (
								!window.confirm(
									`Take down every version of ${report.packageName}? This can't be undone from the website.`,
								)
							)
								return;
							void act(() => takeDown({ data: { packageName: report.packageName, version: null } }));
						}}
					>
						Take down the package
					</button>
				)}
				<button
					type="button"
					className={secondaryButton}
					disabled={pending}
					onClick={() => void act(() => dismissReport({ data: { id: report.id } }))}
				>
					Dismiss
				</button>
			</div>
			{error ? (
				<p role="alert" className={`${fieldError} mt-3`}>
					{error}
				</p>
			) : null}
		</article>
	);
}

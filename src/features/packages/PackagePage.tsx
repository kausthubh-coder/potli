import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";
import type { ReactNode } from "react";

import { DownloadsTile } from "./DownloadsTile";
import { InstallBox } from "./InstallBox";
import type { PackagePageData } from "./packages.data";
import {
	displayUrl,
	formatBytes,
	formatDate,
	isPrerelease,
	splitPackageName,
	timeAgo,
} from "./packages.logic";

export type PackageTab = "readme" | "versions";

function Tag({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
	return (
		<span
			className={`inline-flex h-5 items-center rounded px-1.5 font-mono text-xs ${
				accent ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground"
			}`}
		>
			{children}
		</span>
	);
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-4 py-2">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="min-w-0 text-right tabular-nums">{children}</dd>
		</div>
	);
}

function OutLink({ href, label }: { href: string; label: string }) {
	return (
		<li>
			<a
				href={href}
				rel="nofollow noopener"
				className="group flex items-baseline justify-between gap-4 rounded-md py-3 hover:text-primary sm:py-1.5"
			>
				<span className="text-muted-foreground group-hover:text-primary">{label}</span>
				<span className="flex min-w-0 items-center gap-1.5">
					<span className="truncate">{displayUrl(href)}</span>
					<ExternalLinkIcon className="size-3.5 shrink-0 opacity-60" strokeWidth={1.75} aria-hidden="true" />
				</span>
			</a>
		</li>
	);
}

export function PackagePage({ pkg, origin, tab }: { pkg: PackagePageData; origin: string; tab: PackageTab }) {
	const { scope, name } = splitPackageName(pkg.name);
	const { latest } = pkg;
	const now = pkg.renderedAt;
	const links = [
		latest.repository && { href: latest.repository, label: "Repository" },
		latest.homepage && { href: latest.homepage, label: "Homepage" },
		latest.issues && { href: latest.issues, label: "Issues" },
	].filter((l): l is { href: string; label: string } => Boolean(l));

	return (
		<main className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
			<header className="max-w-3xl">
				<h1 className="text-3xl font-semibold tracking-tight break-words sm:text-4xl">
					<Link to="/scope/$scope" params={{ scope }} className="text-muted-foreground hover:text-foreground">
						@{scope}/
					</Link>
					{name}
				</h1>
				<div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
					<span className="font-mono text-foreground">{latest.version}</span>
					<Tag accent>latest</Tag>
					<span title={formatDate(latest.publishedAt)}>Published {timeAgo(latest.publishedAt, now)}</span>
					{latest.license && <span>{latest.license}</span>}
				</div>
				{pkg.description && (
					<p className="mt-4 max-w-[37rem] text-lg text-muted-foreground">{pkg.description}</p>
				)}
			</header>

			<div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-10 [grid-template-areas:'install'_'content'_'meta'] lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:[grid-template-areas:'content_install'_'content_meta']">
				<section
					aria-labelledby="install-heading"
					className="rounded-xl border bg-card p-5 shadow-raised [grid-area:install]"
				>
					<h2 id="install-heading" className="sr-only">
						Install
					</h2>
					<InstallBox scope={scope} packageName={pkg.name} origin={origin} headingLevel="h3" />
				</section>

				<div className="min-w-0 [grid-area:content]">
					<nav aria-label="Package sections" className="mb-8 flex gap-1 border-b">
						<TabLink tab="readme" current={tab} scope={scope} name={name}>
							Readme
						</TabLink>
						<TabLink tab="versions" current={tab} scope={scope} name={name}>
							Versions <span className="ml-1 text-muted-foreground tabular-nums">{pkg.versions.length}</span>
						</TabLink>
					</nav>
					{tab === "readme" ? <Readme html={pkg.readmeHtml} /> : <Versions pkg={pkg} />}
				</div>

				<aside aria-label="Package details" className="space-y-8 text-sm [grid-area:meta]">
					<DownloadsTile weekly={pkg.weeklySeries} now={now} />

					<dl className="divide-y border-y">
						<MetaRow label="Version">
							<span className="font-mono text-[0.8125rem]">{latest.version}</span>
						</MetaRow>
						<MetaRow label="Published">{formatDate(latest.publishedAt)}</MetaRow>
						<MetaRow label="Tarball size">{formatBytes(latest.size)}</MetaRow>
						{latest.unpackedSize !== null && (
							<MetaRow label="Unpacked size">{formatBytes(latest.unpackedSize)}</MetaRow>
						)}
						{latest.fileCount !== null && <MetaRow label="Files">{latest.fileCount}</MetaRow>}
						{latest.license && <MetaRow label="License">{latest.license}</MetaRow>}
						{latest.node && (
							<MetaRow label="Node">
								<span className="font-mono text-[0.8125rem]">{latest.node}</span>
							</MetaRow>
						)}
					</dl>

					{links.length > 0 && (
						<section aria-labelledby="links-heading">
							<h2 id="links-heading" className="mb-1 font-medium">
								Links
							</h2>
							<ul>
								{links.map((l) => (
									<OutLink key={l.label} {...l} />
								))}
							</ul>
						</section>
					)}

					<section aria-labelledby="deps-heading">
						<h2 id="deps-heading" className="mb-1 font-medium">
							Dependencies{" "}
							<span className="text-muted-foreground tabular-nums">{latest.dependencies.length}</span>
						</h2>
						{latest.dependencies.length === 0 ? (
							<p className="text-muted-foreground">None. Installing this adds only this package.</p>
						) : (
							<ul className="font-mono text-[0.8125rem]">
								{latest.dependencies.map(([dep, range]) => (
									<li key={dep} className="flex justify-between gap-4 py-1">
										<span className="min-w-0 truncate">{dep}</span>
										<span className="shrink-0 text-muted-foreground">{range}</span>
									</li>
								))}
							</ul>
						)}
					</section>
				</aside>
			</div>
		</main>
	);
}

function TabLink({
	tab,
	current,
	scope,
	name,
	children,
}: {
	tab: PackageTab;
	current: PackageTab;
	scope: string;
	name: string;
	children: ReactNode;
}) {
	const active = tab === current;
	return (
		<Link
			to="/package/$scope/$name"
			params={{ scope: `@${scope}`, name }}
			search={tab === "readme" ? {} : { tab }}
			resetScroll={false}
			aria-current={active ? "page" : undefined}
			className={`-mb-px border-b-2 px-3 py-3 text-sm sm:py-2.5 font-medium ${
				active
					? "border-primary text-foreground"
					: "border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground"
			}`}
		>
			{children}
		</Link>
	);
}

function Readme({ html }: { html: string | null }) {
	if (!html) {
		return (
			<div className="rounded-xl border border-dashed px-6 py-10 text-center">
				<p className="font-medium">This package has no README</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Authors: add a README.md next to package.json and publish a new version.
				</p>
			</div>
		);
	}
	// Rendered from markdown and sanitized on the server (readme.logic.ts).
	// biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized with rehype-sanitize's GitHub schema
	return <article className="readme" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Versions({ pkg }: { pkg: PackagePageData }) {
	const now = pkg.renderedAt;
	return (
		<div className="space-y-8">
			{pkg.distTags.length > 0 && (
				<section aria-labelledby="tags-heading">
					<h2 id="tags-heading" className="mb-3 font-medium">
						Tags
					</h2>
					<ul className="flex flex-wrap gap-2">
						{pkg.distTags.map((t) => (
							<li
								key={t.tag}
								className="flex items-center gap-2 rounded-md border bg-card py-1.5 pr-3 pl-2 text-sm"
							>
								<Tag accent={t.tag === "latest"}>{t.tag}</Tag>
								<span className="font-mono text-[0.8125rem]">{t.version}</span>
							</li>
						))}
					</ul>
				</section>
			)}
			<section aria-labelledby="history-heading">
				<h2 id="history-heading" className="mb-3 font-medium">
					All versions
				</h2>
				<table className="w-full text-sm">
					<thead className="sr-only sm:not-sr-only">
						<tr className="border-b text-left text-muted-foreground">
							<th className="py-2 pr-4 font-normal">Version</th>
							<th className="py-2 pr-4 font-normal">Published</th>
							<th className="py-2 text-right font-normal">Tarball</th>
						</tr>
					</thead>
					<tbody className="divide-y">
						{pkg.versions.map((v) => (
							<tr key={v.version}>
								<td className="py-2.5 pr-4">
									<span className="flex flex-wrap items-center gap-2">
										<span className={`font-mono ${isPrerelease(v.version) ? "text-muted-foreground" : ""}`}>
											{v.version}
										</span>
										{v.tags.map((tag) => (
											<Tag key={tag} accent={tag === "latest"}>
												{tag}
											</Tag>
										))}
									</span>
								</td>
								<td className="py-2.5 pr-4 text-muted-foreground tabular-nums">
									<time dateTime={v.publishedAt.toISOString()} title={timeAgo(v.publishedAt, now)}>
										{formatDate(v.publishedAt)}
									</time>
								</td>
								<td className="py-2.5 text-right text-muted-foreground tabular-nums">
									{formatBytes(v.size)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
		</div>
	);
}

import { Link, useNavigate } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useState } from "react";

import { InstallBox } from "#/features/packages/InstallBox";
import { PackageList } from "#/features/packages/PackageList";
import type { PackageSummary } from "#/features/packages/packages.data";
import { splitPackageName } from "#/features/packages/packages.logic";

const facts = [
	{
		title: "Works with the client you have",
		body: "npm, pnpm and bun read the scope's registry from .npmrc. No plugin, no wrapper, and every other package still comes from npm.",
	},
	{
		title: "Versions never change",
		body: "Once a version is published it can't be replaced, so a lockfile installs the same bytes next year as it did today.",
	},
	{
		title: "One Worker, open source",
		body: "The registry and this site are a single Cloudflare Worker on D1 and R2. MIT licensed, on GitHub.",
	},
];

function HeroSearch() {
	const navigate = useNavigate();
	const [value, setValue] = useState("");
	return (
		<search className="mt-8 block max-w-md">
			<form
				action="/search"
				method="get"
				className="relative"
				onSubmit={(event) => {
					event.preventDefault();
					const q = value.trim();
					navigate({ to: "/search", search: q ? { q } : {} });
				}}
			>
				<SearchIcon
					className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
					strokeWidth={1.75}
					aria-hidden="true"
				/>
				<input
					type="search"
					name="q"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					placeholder="Search packages"
					aria-label="Search packages"
					autoComplete="off"
					autoCapitalize="off"
					spellCheck={false}
					enterKeyHint="search"
					className="h-12 w-full rounded-lg border border-input bg-card pr-4 pl-12 text-base placeholder:text-muted-foreground"
				/>
			</form>
		</search>
	);
}

export function HomePage({
	packages,
	total,
	origin,
	now,
}: {
	packages: PackageSummary[];
	total: number;
	origin: string;
	now: Date;
}) {
	const featured = packages[0];
	const featuredName = featured ? splitPackageName(featured.name) : null;

	return (
		<main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
			<section className="grid items-center gap-x-16 gap-y-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:py-24">
				<div>
					<h1 className="text-display font-semibold">Your @scope, one line away.</h1>
					<p className="mt-5 max-w-lg text-lg text-muted-foreground">
						potli is an open-source npm registry for scoped packages. Point a scope at it in{" "}
						<code className="font-mono text-base">.npmrc</code>, then install with npm, pnpm or bun as usual.
					</p>
					<HeroSearch />
				</div>

				<section
					aria-labelledby="example-heading"
					className="min-w-0 rounded-xl border bg-card p-5 shadow-raised sm:p-6"
				>
					<h2 id="example-heading" className="sr-only">
						How installing works
					</h2>
					{featured && featuredName ? (
						<div className="mb-6 flex items-start justify-between gap-4">
							<div className="min-w-0">
								<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
									Latest on potli
								</p>
								<Link
									to="/package/$scope/$name"
									params={{ scope: `@${featuredName.scope}`, name: featuredName.name }}
									className="-my-1 block truncate py-2 text-xl font-semibold tracking-tight hover:underline hover:underline-offset-4"
								>
									<span className="text-muted-foreground">@{featuredName.scope}/</span>
									{featuredName.name}
								</Link>
								{featured.description && (
									<p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{featured.description}</p>
								)}
							</div>
							{featured.version && (
								<span className="shrink-0 pt-5 font-mono text-sm text-muted-foreground">
									{featured.version}
								</span>
							)}
						</div>
					) : (
						<p className="mb-6 text-sm text-muted-foreground">
							Two steps, for any package in a scope. Replace the scope with yours.
						</p>
					)}
					<InstallBox
						scope={featuredName?.scope ?? "your-scope"}
						packageName={featured?.name}
						origin={origin}
						headingLevel="h3"
					/>
				</section>
			</section>

			<section aria-label="Why potli" className="grid gap-8 border-t py-12 sm:grid-cols-3 sm:gap-10">
				{facts.map((fact) => (
					<div key={fact.title}>
						<h2 className="font-medium">{fact.title}</h2>
						<p className="mt-2 text-sm text-muted-foreground">{fact.body}</p>
					</div>
				))}
			</section>

			<section aria-labelledby="recent-heading" className="pt-6 pb-20">
				<div className="mb-2 flex items-baseline justify-between gap-4">
					<h2 id="recent-heading" className="text-xl font-semibold tracking-tight">
						Recently published
					</h2>
					<p className="text-sm text-muted-foreground tabular-nums">
						{total === 1 ? "1 package" : `${total} packages`} on this registry
					</p>
				</div>
				{packages.length === 0 ? (
					<div className="rounded-xl border border-dashed px-6 py-10 text-center">
						<p className="font-medium">Nothing published yet</p>
						<p className="mt-1 text-sm text-muted-foreground">
							The first package published here will show up in this list.
						</p>
					</div>
				) : (
					<PackageList packages={packages} now={now} />
				)}
			</section>
		</main>
	);
}

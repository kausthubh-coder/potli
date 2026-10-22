import { Link, useNavigate } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { PackageList } from "#/features/packages/PackageList";
import type { PackageSummary } from "#/features/packages/packages.data";

export function SearchPage({ query, results, now }: { query: string; results: PackageSummary[]; now: Date }) {
	const navigate = useNavigate();
	const [value, setValue] = useState(query);
	useEffect(() => setValue(query), [query]);

	return (
		<main className="mx-auto w-full max-w-6xl px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
			<div className="max-w-3xl">
				<h1 className="text-2xl font-semibold tracking-tight">Search packages</h1>
				<search className="mt-5 block">
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
							placeholder="Package name or what it does"
							aria-label="Search packages"
							autoComplete="off"
							autoCapitalize="off"
							spellCheck={false}
							enterKeyHint="search"
							className="h-12 w-full rounded-lg border border-input bg-card pr-4 pl-12 text-base placeholder:text-muted-foreground"
						/>
					</form>
				</search>

				<div className="mt-8" aria-live="polite">
					{!query ? (
						<p className="text-muted-foreground">
							Search by name, like <code className="font-mono text-sm">critly</code> or{" "}
							<code className="font-mono text-sm">@kriyan</code>, or by what a package does.
						</p>
					) : results.length === 0 ? (
						<div className="rounded-xl border border-dashed px-6 py-10 text-center">
							<p className="font-medium break-words">No packages match “{query}”</p>
							<p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
								Names and descriptions are searched. Try a shorter word, or browse what was published
								recently.
							</p>
							<Link
								to="/"
								hash="recent-heading"
								className="mt-5 inline-flex h-11 items-center sm:h-9 rounded-md border border-input bg-card px-3 text-sm font-medium hover:bg-accent"
							>
								See recent packages
							</Link>
						</div>
					) : (
						<>
							<h2 className="mb-2 text-sm text-muted-foreground tabular-nums">
								{results.length === 1 ? "1 package" : `${results.length} packages`} for “{query}”
							</h2>
							<PackageList packages={results} now={now} />
						</>
					)}
				</div>
			</div>
		</main>
	);
}

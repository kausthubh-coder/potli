import { Link } from "@tanstack/react-router";

import type { PackageSummary } from "./packages.data";
import { formatCount, formatDate, splitPackageName, timeAgo } from "./packages.logic";

// A list of packages: name, what it does, latest version, last publish and weekly downloads.
// The whole row is the link, so the hit area is the row, not the name.
export function PackageList({ packages, now }: { packages: PackageSummary[]; now: Date }) {
	return (
		<ul className="divide-y border-y">
			{packages.map((pkg) => {
				const { scope, name } = splitPackageName(pkg.name);
				return (
					<li key={pkg.name}>
						<Link
							to="/package/$scope/$name"
							params={{ scope: `@${scope}`, name }}
							className="group -mx-3 grid gap-x-6 gap-y-1 rounded-md px-3 py-4 hover:bg-accent sm:grid-cols-[minmax(0,1fr)_auto]"
						>
							<div className="min-w-0">
								<div className="truncate font-medium">
									<span className="text-muted-foreground">@{scope}/</span>
									<span className="group-hover:underline group-hover:underline-offset-4">{name}</span>
								</div>
								{pkg.description && (
									<p className="mt-0.5 line-clamp-2 max-w-[29rem] text-sm text-muted-foreground">
										{pkg.description}
									</p>
								)}
							</div>
							<div className="mt-1 flex flex-wrap items-baseline gap-x-4 text-sm text-muted-foreground tabular-nums sm:mt-0 sm:flex-col sm:items-end sm:gap-y-0.5">
								<span className="flex items-baseline gap-x-4 sm:gap-x-2">
									{pkg.version && (
										<span className="font-mono text-[0.8125rem] text-foreground">{pkg.version}</span>
									)}
									<span title={formatDate(pkg.updatedAt)}>{timeAgo(pkg.updatedAt, now)}</span>
								</span>
								<span>{formatCount(pkg.weeklyDownloads)} weekly downloads</span>
							</div>
						</Link>
					</li>
				);
			})}
		</ul>
	);
}

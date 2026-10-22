import { InstallBox } from "./InstallBox";
import { PackageList } from "./PackageList";
import type { PackageSummary } from "./packages.data";
import { formatDate } from "./packages.logic";

type ScopeData = {
	scope: {
		name: string;
		kind: "user" | "org";
		createdAt: Date;
		ownerUsername: string | null;
	};
	packages: PackageSummary[];
	renderedAt: Date;
};

export function ScopePage({ data, origin }: { data: ScopeData; origin: string }) {
	const { scope, packages } = data;
	const count = packages.length;
	return (
		<main className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
			<div className="grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_340px]">
				<div className="min-w-0">
					<header>
						<h1 className="text-3xl font-semibold tracking-tight break-words sm:text-4xl">@{scope.name}</h1>
						<p className="mt-3 text-sm text-muted-foreground">
							{scope.kind === "user" ? "Personal scope" : "Organization scope"}
							{scope.ownerUsername && scope.kind === "org" && <> owned by {scope.ownerUsername}</>}
							{" · "}
							since {formatDate(scope.createdAt)}
						</p>
					</header>

					<section aria-labelledby="packages-heading" className="mt-10">
						<h2 id="packages-heading" className="mb-2 text-sm font-medium text-muted-foreground">
							{count === 1 ? "1 package" : `${count} packages`}
						</h2>
						{count === 0 ? (
							<div className="rounded-xl border border-dashed px-6 py-10 text-center">
								<p className="font-medium">No packages in @{scope.name} yet</p>
								<p className="mt-1 text-sm text-muted-foreground">
									Packages published to this scope show up here, newest first.
								</p>
							</div>
						) : (
							<PackageList packages={packages} now={data.renderedAt} />
						)}
					</section>
				</div>

				<section
					aria-labelledby="install-heading"
					className="self-start rounded-xl border bg-card p-5 shadow-raised"
				>
					<h2 id="install-heading" className="mb-4 font-medium">
						Install from @{scope.name}
					</h2>
					<InstallBox scope={scope.name} origin={origin} headingLevel="h3" />
				</section>
			</div>
		</main>
	);
}

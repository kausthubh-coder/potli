import { createFileRoute, redirect } from "@tanstack/react-router";

import { PackageNotFound } from "#/features/packages/PackageNotFound";
import { PackagePage, type PackageTab } from "#/features/packages/PackagePage";
import { getPackagePage } from "#/features/packages/packages.data";
import { getOrigin } from "#/features/site/origin";

// /package/@scope/name. The website can't use paths that start with "/@" (they belong to the
// npm API), so package pages sit under /package/.
export const Route = createFileRoute("/package/$scope/$name")({
	validateSearch: (search: Record<string, unknown>): { tab?: PackageTab } =>
		search.tab === "versions" ? { tab: "versions" } : {},
	beforeLoad: ({ params, search }) => {
		if (!params.scope.startsWith("@")) {
			throw redirect({
				to: "/package/$scope/$name",
				params: { scope: `@${params.scope}`, name: params.name },
				search,
				statusCode: 301,
			});
		}
	},
	loader: async ({ params }) => ({
		pkg: await getPackagePage({ data: { scope: params.scope, name: params.name } }),
		origin: getOrigin(),
	}),
	staleTime: 30_000,
	head: ({ loaderData, params }) => {
		const name = loaderData?.pkg.name ?? `${params.scope}/${params.name}`;
		const description =
			loaderData?.pkg.description ?? `${name} on potli, an npm registry for scoped packages.`;
		return {
			meta: [
				{ title: loaderData ? `${name} · potli` : "Package not found · potli" },
				{ name: "description", content: description },
				{ property: "og:title", content: name },
				{ property: "og:description", content: description },
			],
		};
	},
	component: PackageRoute,
	notFoundComponent: ({ data }) => {
		const info = data as { name?: string; scopeExists?: boolean } | undefined;
		const params = Route.useParams();
		return (
			<PackageNotFound
				name={info?.name ?? `${params.scope}/${params.name}`}
				scopeExists={Boolean(info?.scopeExists)}
			/>
		);
	},
});

function PackageRoute() {
	const { pkg, origin } = Route.useLoaderData();
	const { tab = "readme" } = Route.useSearch();
	return <PackagePage pkg={pkg} origin={origin} tab={tab} />;
}

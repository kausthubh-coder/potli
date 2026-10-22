import { createFileRoute, redirect } from "@tanstack/react-router";
import { getScopePage } from "#/features/packages/packages.data";
import { ScopePage } from "#/features/packages/ScopePage";
import { getOrigin } from "#/features/site/origin";
import { StatusPage } from "#/features/site/StatusPage";

// /scope/name. "/scope/@name" also works and redirects here.
export const Route = createFileRoute("/scope/$scope")({
	beforeLoad: ({ params }) => {
		if (params.scope.startsWith("@")) {
			throw redirect({ to: "/scope/$scope", params: { scope: params.scope.slice(1) }, statusCode: 301 });
		}
	},
	loader: async ({ params }) => ({
		data: await getScopePage({ data: { scope: params.scope } }),
		origin: getOrigin(),
	}),
	staleTime: 30_000,
	head: ({ loaderData, params }) => ({
		meta: [
			{ title: loaderData ? `@${loaderData.data.scope.name} · potli` : "Scope not found · potli" },
			{
				name: "description",
				content: `Packages in @${params.scope} on potli, an npm registry for scoped packages.`,
			},
		],
	}),
	component: ScopeRoute,
	notFoundComponent: () => {
		const { scope } = Route.useParams();
		return (
			<StatusPage
				code="404"
				title={
					<>
						There's no scope named <span className="font-mono text-[0.9em]">@{scope}</span>
					</>
				}
			>
				<p>Nobody has claimed this scope on this registry. Check the spelling, or search for a package.</p>
			</StatusPage>
		);
	},
});

function ScopeRoute() {
	const { data, origin } = Route.useLoaderData();
	return <ScopePage data={data} origin={origin} />;
}

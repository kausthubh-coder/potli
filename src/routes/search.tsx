import { createFileRoute } from "@tanstack/react-router";
import { SearchPage } from "#/features/search/SearchPage";
import { searchPackages } from "#/features/search/search.data";

export const Route = createFileRoute("/search")({
	validateSearch: (search: Record<string, unknown>): { q?: string } =>
		typeof search.q === "string" && search.q.trim() ? { q: search.q } : {},
	loaderDeps: ({ search }) => ({ q: search.q ?? "" }),
	loader: ({ deps }) => searchPackages({ data: { q: deps.q } }),
	head: ({ loaderData }) => ({
		meta: [
			{ title: loaderData?.query ? `“${loaderData.query}” · Search · potli` : "Search · potli" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: SearchRoute,
});

function SearchRoute() {
	const { query, results, renderedAt } = Route.useLoaderData();
	return <SearchPage query={query} results={results} now={renderedAt} />;
}

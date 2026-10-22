import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "#/features/home/HomePage";
import { getRecentPackages } from "#/features/packages/packages.data";
import { getOrigin } from "#/features/site/origin";

export const Route = createFileRoute("/")({
	loader: async () => ({ recent: await getRecentPackages(), origin: getOrigin() }),
	staleTime: 30_000,
	component: Home,
});

function Home() {
	const { recent, origin } = Route.useLoaderData();
	return <HomePage packages={recent.packages} total={recent.total} origin={origin} now={recent.renderedAt} />;
}

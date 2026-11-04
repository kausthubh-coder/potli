import { createFileRoute, notFound } from "@tanstack/react-router";

import { AdminPage } from "#/features/moderation/AdminPage";
import { getAdminReports } from "#/features/moderation/moderation.functions";

// Only for GitHub logins in ADMIN_LOGINS. Anyone else, signed in or not, gets the 404 page, so the
// page doesn't say it exists.
export const Route = createFileRoute("/admin")({
	loader: async () => {
		const reports = await getAdminReports();
		if (!reports) throw notFound();
		return { ...reports, renderedAt: new Date() };
	},
	head: () => ({ meta: [{ title: "Reports · potli" }, { name: "robots", content: "noindex" }] }),
	component: AdminRoute,
});

function AdminRoute() {
	return <AdminPage data={Route.useLoaderData()} />;
}

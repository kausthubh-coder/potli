import { createFileRoute, redirect } from "@tanstack/react-router";

import { getSettings } from "#/features/auth/auth.functions";
import { SettingsPage } from "#/features/auth/SettingsPage";

export const Route = createFileRoute("/settings")({
	loader: async () => {
		const data = await getSettings();
		if (!data) throw redirect({ to: "/sign-in" });
		return data;
	},
	head: () => ({ meta: [{ title: "Settings · potli" }] }),
	component: SettingsRoute,
});

function SettingsRoute() {
	return <SettingsPage data={Route.useLoaderData()} />;
}

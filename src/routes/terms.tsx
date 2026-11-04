import { createFileRoute } from "@tanstack/react-router";

import { TermsPage } from "#/features/site/TermsPage";

export const Route = createFileRoute("/terms")({
	head: () => ({
		meta: [
			{ title: "Terms · potli" },
			{ name: "description", content: "potli's terms and acceptable use, in plain words." },
		],
	}),
	component: TermsPage,
});

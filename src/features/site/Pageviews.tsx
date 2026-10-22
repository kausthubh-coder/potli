import { usePostHog } from "@posthog/react";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

// PostHog is set up with capture_pageview off (src/integrations/posthog), because a client-side
// navigation doesn't load a page. This sends one $pageview per URL the visitor lands on, after
// the new page rendered so the title is current. Does nothing without VITE_POSTHOG_KEY.
export function Pageviews() {
	const router = useRouter();
	const posthog = usePostHog();

	useEffect(() => {
		if (!import.meta.env.VITE_POSTHOG_KEY) return;
		let last = "";
		const capture = () => {
			const href = window.location.href;
			if (href === last) return;
			last = href;
			posthog.capture("$pageview", { $current_url: href });
		};
		capture();
		return router.subscribe("onRendered", (event) => {
			if (event.hrefChanged) capture();
		});
	}, [router, posthog]);

	return null;
}

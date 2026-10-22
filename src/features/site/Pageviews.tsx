import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

// posthog-js is most of the site's JavaScript, so it loads after the page has rendered, in its own
// chunk, and only when VITE_POSTHOG_KEY is set. capture_pageview is off because a client-side
// navigation doesn't load a page: this sends one $pageview per URL the visitor lands on, after the
// new page rendered so the title is current.
export function Pageviews() {
	const router = useRouter();

	useEffect(() => {
		const key = import.meta.env.VITE_POSTHOG_KEY;
		if (!key) return;
		let stopped = false;
		let unsubscribe = () => {};
		import("posthog-js").then(({ default: posthog }) => {
			if (stopped) return;
			if (!posthog.__loaded) {
				posthog.init(key, {
					api_host: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
					person_profiles: "identified_only",
					capture_pageview: false,
					defaults: "2025-11-30",
				});
			}
			let last = "";
			const capture = () => {
				const href = window.location.href;
				if (href === last) return;
				last = href;
				posthog.capture("$pageview", { $current_url: href });
			};
			capture();
			unsubscribe = router.subscribe("onRendered", (event) => {
				if (event.hrefChanged) capture();
			});
		});
		return () => {
			stopped = true;
			unsubscribe();
		};
	}, [router]);

	return null;
}

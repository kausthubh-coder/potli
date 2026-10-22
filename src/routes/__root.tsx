import plexSansLatin from "@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2?url";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Link, Scripts } from "@tanstack/react-router";
import { lazy, type ReactNode, Suspense } from "react";

import { Pageviews } from "#/features/site/Pageviews";
import { SiteFooter } from "#/features/site/SiteFooter";
import { SiteHeader } from "#/features/site/SiteHeader";
import { buttonClass, StatusPage } from "#/features/site/StatusPage";
import { themeScript } from "#/features/site/theme";
import PostHogProvider from "#/integrations/posthog/provider";
import appCss from "#/styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

// `import.meta.env.DEV` is false in `vite build`, so the devtools chunk is dropped from production.
const Devtools = import.meta.env.DEV ? lazy(() => import("#/features/site/Devtools")) : () => null;

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "potli: an npm registry for scoped packages" },
			{
				name: "description",
				content:
					"potli is an open-source npm registry for @scope packages. Add one line to .npmrc, then install with npm, pnpm or bun.",
			},
			{ name: "theme-color", content: "#f9f7f3", media: "(prefers-color-scheme: light)" },
			{ name: "theme-color", content: "#13141f", media: "(prefers-color-scheme: dark)" },
			{ property: "og:site_name", content: "potli" },
		],
		links: [
			{ rel: "preload", href: plexSansLatin, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
		],
	}),
	shellComponent: RootDocument,
	notFoundComponent: () => (
		<StatusPage code="404" title="This page doesn't exist">
			<p>The link may be old, or the address has a typo. Package pages live at /package/@scope/name.</p>
		</StatusPage>
	),
	errorComponent: ({ error, reset }) => (
		<StatusPage
			code="500"
			title="Something went wrong loading this page"
			actions={
				<>
					<button type="button" onClick={reset} className={buttonClass("primary")}>
						Try again
					</button>
					<Link to="/" className={buttonClass("secondary")}>
						Go to the home page
					</Link>
				</>
			}
		>
			<p>Reloading usually fixes it. If it keeps happening, open an issue on GitHub with this message:</p>
			<p className="mt-3 font-mono text-sm break-words">
				{error instanceof Error ? error.message : String(error)}
			</p>
		</StatusPage>
	),
});

function RootDocument({ children }: { children: ReactNode }) {
	return (
		// The theme script sets the "dark" class before React hydrates.
		<html lang="en" suppressHydrationWarning>
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed string from our own code, needed before first paint */}
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
				<HeadContent />
			</head>
			<body>
				<PostHogProvider>
					<a
						href="#main"
						className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow-raised"
					>
						Skip to content
					</a>
					<div className="flex min-h-dvh flex-col">
						<SiteHeader />
						<div id="main" className="flex flex-1 flex-col">
							{children}
						</div>
						<SiteFooter />
					</div>
					<Pageviews />
					<Suspense>
						<Devtools />
					</Suspense>
				</PostHogProvider>
				<Scripts />
			</body>
		</html>
	);
}

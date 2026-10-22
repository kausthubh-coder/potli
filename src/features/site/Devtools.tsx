import { TanStackDevtools } from "@tanstack/react-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import TanStackQueryDevtools from "#/integrations/tanstack-query/devtools";

// Loaded only by `vite dev` (see the lazy import in __root.tsx); never part of a production build.
export default function Devtools() {
	return (
		<TanStackDevtools
			config={{ position: "bottom-right" }}
			plugins={[{ name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> }, TanStackQueryDevtools]}
		/>
	);
}

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	// Each checkout gets its own port from `bun run setup`, written to .env.local.
	const port = Number(process.env.PORT || loadEnv(mode, process.cwd(), "").PORT || 3000);
	return {
		resolve: { tsconfigPaths: true },
		server: { port, strictPort: true },
		plugins: [
			devtools(),
			cloudflare({ viteEnvironment: { name: "ssr" } }),
			tailwindcss(),
			tanstackStart(),
			viteReact(),
		],
	};
});

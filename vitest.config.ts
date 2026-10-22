import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside workerd with the real D1 and R2 bindings from wrangler.jsonc, each test
// file against fresh local storage. They import feature code directly; the website itself
// needs the TanStack Start Vite plugins and is checked by driving the dev server instead.
export default defineConfig(async () => ({
	resolve: { tsconfigPaths: true },
	plugins: [
		cloudflareTest({
			main: "./test/worker.ts",
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: {
				bindings: { TEST_MIGRATIONS: await readD1Migrations("./drizzle") },
			},
		}),
	],
	test: {
		include: ["src/**/*.test.ts"],
		setupFiles: ["./test/apply-migrations.ts"],
	},
}));

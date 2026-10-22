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
				// Fixed values so tests behave the same with or without a .dev.vars (CI has none).
				bindings: {
					TEST_MIGRATIONS: await readD1Migrations("./drizzle"),
					BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
					BETTER_AUTH_URL: "http://localhost:3000",
					GITHUB_CLIENT_ID: "",
					GITHUB_CLIENT_SECRET: "",
					SIGNUP_ALLOWLIST: "alice, Bob",
					DEV_LOGIN: "1",
				},
			},
		}),
	],
	test: {
		include: ["src/**/*.test.ts"],
		setupFiles: ["./test/apply-migrations.ts"],
	},
}));

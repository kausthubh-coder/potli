import { defineConfig } from "drizzle-kit";

// Only used to generate SQL migrations into ./drizzle. Wrangler applies them:
// `bun run db:migrate` (local D1). Production is in docs/ops.md.
export default defineConfig({
	out: "./drizzle",
	schema: "./src/db/schema.ts",
	dialect: "sqlite",
});

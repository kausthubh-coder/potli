import { registry } from "#/features/registry/registry.api";

// Test-only Worker entry: the registry without the website, which needs Vite to build.
export default { fetch: registry.fetch };

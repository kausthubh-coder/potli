// Which drizzle/ migrations this checkout's local D1 has not applied, read straight from the SQLite
// file wrangler keeps in .wrangler/state. Asking wrangler takes 5-10s per call; this takes
// milliseconds, which keeps a setup rerun fast. Used by setup.mjs and doctor.mjs.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Returns the pending migration file names, or null when this Node has no node:sqlite
// (then ask wrangler instead). A checkout with no local D1 yet has every migration pending.
export async function pendingMigrations(root) {
	const all = readdirSync(join(root, "drizzle"))
		.filter((f) => f.endsWith(".sql"))
		.sort();
	let DatabaseSync;
	// Node 22 prints an ExperimentalWarning when node:sqlite loads, into the middle of the doctor's
	// output. Only this read-only use touches it, so silence warnings for the import alone.
	const emitWarning = process.emitWarning;
	process.emitWarning = () => {};
	try {
		({ DatabaseSync } = await import("node:sqlite"));
	} catch {
		return null;
	} finally {
		process.emitWarning = emitWarning;
	}
	const dir = join(root, ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");
	const files = existsSync(dir)
		? readdirSync(dir).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite")
		: [];
	const applied = new Set();
	for (const file of files) {
		const db = new DatabaseSync(join(dir, file), { readOnly: true });
		try {
			for (const row of db.prepare("SELECT name FROM d1_migrations").all()) applied.add(row.name);
		} catch {
			// A database wrangler created but never migrated has no d1_migrations table yet.
		} finally {
			db.close();
		}
	}
	return all.filter((name) => !applied.has(name));
}

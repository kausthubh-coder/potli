import { describe, expect, it } from "vitest";

import { registry } from "./registry.api";

describe("registry", () => {
	it("answers npm ping", async () => {
		const res = await registry.request("/-/ping");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({});
	});

	it("returns a JSON 404 for an unknown package", async () => {
		const res = await registry.request("/@nobody%2fnothing");
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "Not found" });
	});
});

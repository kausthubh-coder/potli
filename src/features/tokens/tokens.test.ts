import { describe, expect, it } from "vitest";

import { generateToken, hashToken, tokenFromAuthHeader } from "./tokens.logic";

describe("publish tokens", () => {
	it("generates distinct prefixed tokens that npm's Bearer header round-trips", () => {
		const a = generateToken();
		const b = generateToken();
		expect(a).toMatch(/^potli_[A-Za-z0-9_-]{43}$/);
		expect(a).not.toBe(b);
		expect(tokenFromAuthHeader(`Bearer ${a}`)).toBe(a);
	});

	it("hashes to the SHA-256 hex digest", async () => {
		// Same value as `node -e "crypto.createHash('sha256').update('potli_test').digest('hex')"`
		expect(await hashToken("potli_test")).toBe(
			"0db5a475f94d59f19be682547ee02670ef93e7f7a712dbbd8e84068add066153",
		);
	});

	it("rejects headers that are not a potli Bearer token", () => {
		expect(tokenFromAuthHeader(undefined)).toBeNull();
		expect(tokenFromAuthHeader("Basic dXNlcjpwYXNz")).toBeNull();
		expect(tokenFromAuthHeader("Bearer npm_abc")).toBeNull();
	});
});

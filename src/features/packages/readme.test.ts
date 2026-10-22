import { describe, expect, it } from "vitest";

import { githubRepo, renderReadme } from "./readme.logic";

const repo = "https://github.com/kausthubh-coder/critly/tree/HEAD/packages/critly";

describe("README rendering", () => {
	it("renders GitHub-flavored markdown", () => {
		const html = renderReadme("# critly\n\n| a | b |\n| - | - |\n| `x` | y |\n\n- [x] done", null);
		expect(html).toContain('<h1 id="user-content-critly">critly</h1>');
		expect(html).toContain("<table>");
		expect(html).toContain("<td><code>x</code></td>");
		expect(html).toContain('<input type="checkbox" checked disabled>');
	});

	it("removes scripts, event handlers, styles, frames and javascript: URLs", () => {
		const html = renderReadme(
			[
				"<script>alert(1)</script>",
				'<img src="https://example.com/a.png" onerror="alert(2)">',
				'<a href="javascript:alert(3)">click</a>',
				"[md link](javascript:alert(4))",
				'<iframe src="https://evil.example"></iframe>',
				"<style>body{display:none}</style>",
				'<p style="position:fixed" onclick="alert(5)">hi</p>',
				'<form action="https://evil.example"><input name="password"></form>',
			].join("\n\n"),
			null,
		);
		expect(html).not.toMatch(/<script|onerror|onclick|javascript:|<iframe|<style|style=|<form|alert\(/i);
		expect(html).toContain("<p>hi</p>");
		expect(html).toContain("<a>click</a>");
	});

	it("keeps the safe HTML READMEs use for layout", () => {
		const html = renderReadme(
			'<p align="center"><img src="https://example.com/logo.png" alt="logo"></p>',
			null,
		);
		expect(html).toBe(
			'<p align="center"><img src="https://example.com/logo.png" alt="logo" loading="lazy" decoding="async"></p>',
		);
	});

	it("drops HTML comments", () => {
		expect(renderReadme("<!-- rules:begin -->\ntext", null)).not.toContain("rules:begin");
	});

	it("prefixes ids so a heading can't clobber a global, and keeps in-page links working", () => {
		const html = renderReadme('## Install\n\n[jump](#install)\n\n<a id="location" name="top">x</a>', null);
		expect(html).toContain('<h2 id="user-content-install">Install</h2>');
		expect(html).toContain('href="#user-content-install"');
		expect(html).toContain('id="user-content-location"');
		expect(html).not.toContain('id="location"');
	});

	it("points relative links and images into the GitHub repo, and marks outside links", () => {
		const html = renderReadme(
			"[policy](./docs/policy.md) ![shot](shot.png) [site](https://critly.vercel.app)",
			repo,
		);
		expect(html).toContain(
			'href="https://github.com/kausthubh-coder/critly/blob/HEAD/packages/critly/docs/policy.md"',
		);
		expect(html).toContain(
			'src="https://raw.githubusercontent.com/kausthubh-coder/critly/HEAD/packages/critly/shot.png"',
		);
		expect(html).toContain('<a href="https://critly.vercel.app" rel="nofollow ugc noopener">site</a>');
	});

	it("reads the owner, repo and folder from a repository URL", () => {
		expect(githubRepo(repo)).toEqual({
			owner: "kausthubh-coder",
			repo: "critly",
			directory: "packages/critly",
		});
		expect(githubRepo("https://github.com/o/r")).toEqual({ owner: "o", repo: "r", directory: "" });
		expect(githubRepo("https://gitlab.com/o/r")).toBeNull();
	});
});

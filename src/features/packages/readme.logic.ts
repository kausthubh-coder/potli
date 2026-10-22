import type { Element, Root } from "hast";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

// READMEs are user-submitted. They are rendered to HTML on the server and sanitized with
// GitHub's allowlist (rehype-sanitize's default schema): no scripts, styles, iframes, event
// handlers or javascript: URLs survive, and ids are prefixed with "user-content-" so a heading
// can't clobber a global. The browser only ever receives the sanitized HTML string.

const CLOBBER_PREFIX = "user-content-";

type GithubRepo = { owner: string; repo: string; directory: string };

/** "https://github.com/o/r/tree/HEAD/packages/x" -> { owner, repo, directory: "packages/x" } */
export function githubRepo(repositoryUrl: string | null): GithubRepo | null {
	if (!repositoryUrl) return null;
	const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)(?:\/tree\/HEAD\/(.+))?$/.exec(repositoryUrl);
	if (!match) return null;
	return { owner: match[1], repo: match[2], directory: match[3] ?? "" };
}

function isRelative(url: string): boolean {
	return !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith("//") && !url.startsWith("#");
}

function resolveInRepo(url: string, repo: GithubRepo, kind: "link" | "image"): string {
	const path = url.startsWith("/")
		? url.slice(1)
		: [repo.directory, url.replace(/^\.\//, "")].filter(Boolean).join("/");
	return kind === "image"
		? `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/HEAD/${path}`
		: `https://github.com/${repo.owner}/${repo.repo}/blob/HEAD/${path}`;
}

/** Relative links and images in a README point into the package's GitHub repo, like on npmjs. */
function resolveRelativeUrls(repo: GithubRepo | null) {
	return () => (tree: Root) => {
		if (!repo) return;
		visit(tree, "element", (node: Element) => {
			const attr = node.tagName === "img" ? "src" : node.tagName === "a" ? "href" : null;
			if (!attr) return;
			const value = node.properties[attr];
			if (typeof value === "string" && value && isRelative(value)) {
				node.properties[attr] = resolveInRepo(value, repo, attr === "src" ? "image" : "link");
			}
		});
	};
}

/** After sanitizing: in-page links follow the prefixed ids, outside links get rel, images load lazily. */
function finishElements() {
	return (tree: Root) => {
		visit(tree, "element", (node: Element) => {
			if (node.tagName === "a" && typeof node.properties.href === "string") {
				const href = node.properties.href;
				if (href.startsWith("#") && !href.startsWith(`#${CLOBBER_PREFIX}`)) {
					node.properties.href = `#${CLOBBER_PREFIX}${href.slice(1)}`;
				} else if (/^https?:\/\//.test(href)) {
					node.properties.rel = ["nofollow", "ugc", "noopener"];
				}
			}
			if (node.tagName === "img") {
				node.properties.loading = "lazy";
				node.properties.decoding = "async";
			}
		});
	};
}

export function renderReadme(markdown: string, repositoryUrl: string | null): string {
	const file = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeRaw)
		.use(resolveRelativeUrls(githubRepo(repositoryUrl)))
		.use(rehypeSlug)
		.use(rehypeSanitize, { ...defaultSchema, clobberPrefix: CLOBBER_PREFIX })
		.use(finishElements)
		.use(rehypeStringify)
		.processSync(markdown);
	return String(file);
}

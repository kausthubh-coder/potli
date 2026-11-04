import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

// Plain and short on purpose: one developer runs potli for free. Change UPDATED when the text does.
const UPDATED = "November 4, 2026";

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="mt-10">
			<h2 className="text-lg font-semibold tracking-tight">{title}</h2>
			<div className="mt-2 space-y-3 text-pretty text-muted-foreground">{children}</div>
		</section>
	);
}

const link = "text-foreground underline underline-offset-4 hover:text-primary";

export function TermsPage() {
	return (
		<main className="mx-auto w-full max-w-2xl px-4 pt-12 pb-24 sm:pt-16">
			<h1 className="text-3xl font-semibold tracking-tight">Terms</h1>
			<p className="mt-2 text-sm text-muted-foreground">Last changed {UPDATED}</p>
			<p className="mt-6 text-lg text-pretty text-muted-foreground">
				potli is a free npm registry for scoped packages. One developer runs it,{" "}
				<a href="https://github.com/kausthubh-coder" className={link}>
					@kausthubh-coder
				</a>{" "}
				on GitHub. If you sign in, publish or install from it, you agree to these terms.
			</p>

			<Section title="No guarantees">
				<p>
					potli comes as is. There is no company behind it, no paid plan and no promise that it stays up. It
					can change or shut down. Keep your own copy of anything you publish here.
				</p>
			</Section>

			<Section title="Your packages">
				<p>
					You keep the rights to what you publish. Publishing lets potli store your package and serve it to
					anyone who asks for it.
				</p>
				<p>
					A published version never changes, and its version number can't be used again. Don't publish
					anything you'd need to take back, like a password or an API key.
				</p>
			</Section>

			<Section title="Acceptable use">
				<p>Don't use potli to publish or do any of these:</p>
				<ul className="list-disc space-y-1.5 pl-5">
					<li>
						Malware, or code that does something its users wouldn't expect and wouldn't want, like an install
						script that steals tokens or mines crypto.
					</li>
					<li>A package or scope that pretends to belong to someone else.</li>
					<li>Scopes or names claimed only to hold them or sell them.</li>
					<li>Spam: empty packages, junk, or packages that exist to advertise something.</li>
					<li>Code or files you don't have the right to share, or anything illegal.</li>
					<li>Extra accounts or scripts to get around a rate limit or a takedown.</li>
				</ul>
				<p>
					Publishing, creating tokens, claiming scopes, signing in and sending reports have rate limits.
					Installs and downloads don't.
				</p>
			</Section>

			<Section title="Reports and takedowns">
				<p>
					Anyone can report a package with the Report button on its page. When a package or a version breaks
					these terms, it gets taken down: npm, pnpm and bun can't install it, its page says it was taken
					down, and its version numbers can't be published again. An account that keeps breaking the terms can
					be closed.
				</p>
				<p>
					If you think a takedown was a mistake, open an issue on{" "}
					<a href="https://github.com/kausthubh-coder/potli/issues" className={link}>
						potli's GitHub
					</a>
					.
				</p>
			</Section>

			<Section title="What potli stores">
				<p>
					Your GitHub login, name, email address and avatar, the packages you publish, and a hash of each
					publish token. For rate limits, potli keeps a salted hash of your IP address for up to a day. The
					website counts page views with PostHog.
				</p>
			</Section>

			<Section title="Changes">
				<p>
					These terms can change. The date at the top says when they last did. The code is open, so you can
					see every change in the{" "}
					<a href="https://github.com/kausthubh-coder/potli/commits/main" className={link}>
						commit history
					</a>
					.
				</p>
			</Section>

			<p className="mt-12 text-sm text-muted-foreground">
				<Link to="/" className={link}>
					Back to potli
				</Link>
			</p>
		</main>
	);
}

import { PotliMark } from "./PotliMark";

// Padding grows the target to 44px on phones (24px on desktop); negative margin keeps the layout.
const footerLink =
	"-my-3 inline-block py-3 underline-offset-4 hover:text-foreground hover:underline sm:-my-1 sm:py-1";

export function SiteFooter() {
	return (
		<footer className="mt-auto border-t">
			<div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
				<p className="flex items-center gap-2">
					<PotliMark className="size-4" />
					<span>potli is an open-source npm registry for scoped packages.</span>
				</p>
				<nav aria-label="Project" className="flex items-center gap-5">
					<a href="https://github.com/kausthubh-coder/potli" className={footerLink}>
						GitHub
					</a>
					<a href="https://github.com/kausthubh-coder/potli/blob/main/LICENSE" className={footerLink}>
						MIT license
					</a>
				</nav>
			</div>
		</footer>
	);
}

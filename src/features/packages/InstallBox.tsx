import { useEffect, useState } from "react";

import { CopyButton } from "./CopyButton";
import { installCommand, npmrcLine, PACKAGE_MANAGERS, type PackageManager } from "./packages.logic";

const PM_KEY = "potli-pm";

function CommandLine({ text, label }: { text: string; label: string }) {
	return (
		<div className="flex min-w-0 items-center gap-2 rounded-md bg-muted py-1 pr-1 pl-3">
			{/* Long origins wrap instead of hiding behind a scrollbar, preferably right after "=";
			    the button copies the exact text. */}
			<code className="min-w-0 flex-1 py-1.5 font-mono text-[0.8125rem] leading-5 [overflow-wrap:anywhere]">
				{text.includes("=") ? (
					<>
						{text.slice(0, text.indexOf("=") + 1)}
						<wbr />
						{text.slice(text.indexOf("=") + 1)}
					</>
				) : (
					text
				)}
			</code>
			<CopyButton text={text} label={label} />
		</div>
	);
}

/**
 * The two steps to install from potli: send the scope to this registry in .npmrc (once per
 * project), then install with any package manager. With no `packageName` it shows the steps
 * for a whole scope.
 */
export function InstallBox({
	scope,
	packageName,
	origin,
	headingLevel = "h2",
}: {
	scope: string;
	packageName?: string;
	origin: string;
	headingLevel?: "h2" | "h3";
}) {
	const [pm, setPm] = useState<PackageManager>("npm");
	const Heading = headingLevel;

	// The last manager someone picked sticks across pages. Read after mount so the server
	// render and the first client render agree.
	useEffect(() => {
		const saved = localStorage.getItem(PM_KEY);
		if (saved === "npm" || saved === "pnpm" || saved === "bun") setPm(saved);
	}, []);

	const choose = (next: PackageManager) => {
		setPm(next);
		try {
			localStorage.setItem(PM_KEY, next);
		} catch {
			// Private mode: remembered for this page only.
		}
	};

	const target = packageName ?? `@${scope}/<package>`;

	return (
		<ol className="space-y-5">
			<li>
				<Heading className="mb-2 flex items-baseline gap-2 text-sm font-medium">
					<span className="font-mono text-xs text-muted-foreground">1</span>
					<span>
						Add <code className="font-mono text-[0.8125rem]">@{scope}</code> to your project's{" "}
						<code className="font-mono text-[0.8125rem]">.npmrc</code>
					</span>
				</Heading>
				<CommandLine text={npmrcLine(scope, origin)} label="Copy the .npmrc line" />
				<p className="mt-1.5 text-xs text-muted-foreground">
					Once per project. Other scopes still come from npm.
				</p>
			</li>
			<li>
				<div className="mb-2 flex items-center justify-between gap-3">
					<Heading className="flex items-baseline gap-2 text-sm font-medium">
						<span className="font-mono text-xs text-muted-foreground">2</span>
						<span>Install</span>
					</Heading>
					<fieldset className="flex rounded-md bg-muted p-0.5">
						<legend className="sr-only">Package manager</legend>
						{PACKAGE_MANAGERS.map((name) => (
							<button
								key={name}
								type="button"
								aria-pressed={pm === name}
								onClick={() => choose(name)}
								// The visible pill stays compact; ::after makes the target 44px tall on phones.
								className="relative rounded-[4px] px-3 py-1 font-mono after:absolute after:inset-x-0 after:-inset-y-2.5 sm:after:-inset-y-1 text-xs text-muted-foreground hover:text-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-raised"
							>
								{name}
							</button>
						))}
					</fieldset>
				</div>
				<CommandLine text={installCommand(pm, target)} label={`Copy the ${pm} install command`} />
			</li>
		</ol>
	);
}

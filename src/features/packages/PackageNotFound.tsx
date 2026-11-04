import { Link } from "@tanstack/react-router";

import { buttonClass, StatusPage } from "#/features/site/StatusPage";
import { splitPackageName } from "./packages.logic";

export function PackageNotFound({
	name,
	scopeExists,
	takenDown,
}: {
	name: string;
	scopeExists: boolean;
	takenDown: boolean;
}) {
	const { scope, name: shortName } = splitPackageName(name);
	if (takenDown) {
		return (
			<StatusPage
				code="410"
				title={
					<>
						<span className="font-mono text-[0.9em]">{name}</span> was taken down
					</>
				}
				actions={
					<>
						<Link to="/terms" className={buttonClass("primary")}>
							Read the terms
						</Link>
						<Link to="/scope/$scope" params={{ scope }} className={buttonClass("secondary")}>
							See packages in @{scope}
						</Link>
					</>
				}
			>
				<p>
					It was taken down for breaking potli's terms. npm, pnpm and bun can't install it, and its version
					numbers can't be published again.
				</p>
			</StatusPage>
		);
	}
	return (
		<StatusPage
			code="404"
			title={
				<>
					There's no package named <span className="font-mono text-[0.9em]">{name}</span>
				</>
			}
			actions={
				<>
					<Link to="/search" search={{ q: shortName }} className={buttonClass("primary")}>
						Search for “{shortName}”
					</Link>
					{scopeExists && (
						<Link to="/scope/$scope" params={{ scope }} className={buttonClass("secondary")}>
							See packages in @{scope}
						</Link>
					)}
				</>
			}
		>
			<p>
				{scopeExists
					? `The scope @${scope} exists, but nothing in it has this name. Check the spelling, or look through the scope.`
					: `Nothing has been published to @${scope} on this registry. Check the spelling, or search for the package.`}
			</p>
		</StatusPage>
	);
}

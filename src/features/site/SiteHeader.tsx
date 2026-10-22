import { Link } from "@tanstack/react-router";

import { UserMenu } from "#/features/auth/UserMenu";
import { HeaderSearch } from "./HeaderSearch";
import { PotliMark } from "./PotliMark";
import { ThemeToggle } from "./theme";

export function SiteHeader() {
	return (
		<header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
			<div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
				<Link
					to="/"
					className="-ml-1.5 flex h-11 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-lg font-semibold tracking-tight"
					aria-label="potli home"
				>
					<PotliMark className="size-6" />
					<span>potli</span>
				</Link>
				<HeaderSearch className="min-w-0 flex-1 sm:max-w-sm" />
				<div className="ml-auto flex shrink-0 items-center gap-1">
					<ThemeToggle />
					<UserMenu />
				</div>
			</div>
		</header>
	);
}

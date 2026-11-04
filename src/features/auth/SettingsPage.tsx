import { Link } from "@tanstack/react-router";

import { ScopesSection } from "#/features/scopes/ScopesSection";
import { TokensSection } from "#/features/tokens/TokensSection";
import type { getSettings } from "./auth.functions";
import { Avatar } from "./UserMenu";

export type SettingsData = NonNullable<Awaited<ReturnType<typeof getSettings>>>;

export function SettingsPage({ data }: { data: SettingsData }) {
	const { user, userScope, scopes, tokens, isAdmin } = data;
	return (
		<main className="mx-auto w-full max-w-2xl px-4 pt-12 pb-24 sm:pt-16">
			<div className="flex items-center gap-4">
				<Avatar name={user.username ?? user.name} image={user.image} size="lg" />
				<div className="min-w-0">
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
					<p className="truncate text-muted-foreground">
						Signed in with GitHub as{" "}
						<span className="font-medium text-foreground">
							{user.username ? `@${user.username}` : user.name}
						</span>
					</p>
				</div>
			</div>

			{isAdmin ? (
				<p className="mt-8 rounded-lg border bg-card px-4 py-3 text-sm">
					You're one of potli's admins.{" "}
					<Link to="/admin" className="font-medium underline underline-offset-4 hover:text-primary">
						Review reports
					</Link>
				</p>
			) : null}

			<div className="mt-12 space-y-14">
				<ScopesSection scopes={scopes} userScope={userScope} />
				<TokensSection tokens={tokens} scopeNames={scopes.map((scope) => scope.name)} />
			</div>
		</main>
	);
}

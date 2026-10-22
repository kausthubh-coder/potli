// The header's account control: the signed-in user's avatar and a menu (Settings, Sign out), or
// a "Sign in with GitHub" button.
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Github, LogOut, Settings } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { secondaryButton } from "#/lib/form-styles";
import { authClient } from "./auth-client";

export function UserMenu() {
	const { data, isPending } = authClient.useSession();
	// Same size as the avatar, so the header doesn't shift when the session arrives.
	if (isPending) return <div className="size-9 rounded-full bg-muted" aria-hidden="true" />;
	if (!data) return <SignInWithGitHub />;
	const username = typeof data.user.username === "string" ? data.user.username : null;
	return <AccountMenu name={data.user.name} username={username} image={data.user.image ?? null} />;
}

export function startGitHubSignIn(callbackURL: string) {
	return authClient.signIn.social({ provider: "github", callbackURL, errorCallbackURL: "/sign-in" });
}

function SignInWithGitHub() {
	const navigate = useNavigate();
	const [pending, setPending] = useState(false);
	return (
		<button
			type="button"
			className={`${secondaryButton} h-9 px-3`}
			disabled={pending}
			onClick={async () => {
				setPending(true);
				const { error } = await startGitHubSignIn(window.location.pathname);
				// The sign-in page explains what went wrong (and offers dev sign-in locally).
				if (error) {
					setPending(false);
					await navigate({ to: "/sign-in", search: { error: "github_unavailable" } });
				}
			}}
		>
			<Github className="size-4" aria-hidden="true" />
			{pending ? "Opening GitHub…" : "Sign in with GitHub"}
		</button>
	);
}

export function Avatar({ name, image, size }: { name: string; image: string | null; size: "sm" | "lg" }) {
	const box = size === "sm" ? "size-9 text-sm" : "size-12 text-lg";
	if (image) {
		return (
			<img
				src={image}
				alt=""
				width={size === "sm" ? 36 : 48}
				height={size === "sm" ? 36 : 48}
				className={`${box} rounded-full bg-muted object-cover outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10`}
			/>
		);
	}
	return (
		<span
			aria-hidden="true"
			className={`${box} inline-flex items-center justify-center rounded-full bg-foreground/10 font-semibold text-foreground uppercase`}
		>
			{name.slice(0, 1)}
		</span>
	);
}

function menuItems(menu: HTMLElement | null): HTMLElement[] {
	return [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
}

function AccountMenu({
	name,
	username,
	image,
}: {
	name: string;
	username: string | null;
	image: string | null;
}) {
	const router = useRouter();
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const menuId = useId();

	const close = (returnFocus: boolean) => {
		setOpen(false);
		if (returnFocus) buttonRef.current?.focus();
	};

	// Focus goes into the menu when it opens; a click anywhere else closes it.
	useEffect(() => {
		if (!open) return;
		menuItems(menuRef.current)[0]?.focus();
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node;
			if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [open]);

	const onMenuKeyDown = (event: React.KeyboardEvent) => {
		const all = menuItems(menuRef.current);
		const index = all.indexOf(document.activeElement as HTMLElement);
		if (event.key === "Escape") {
			event.preventDefault();
			close(true);
		} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const step = event.key === "ArrowDown" ? 1 : -1;
			all[(index + step + all.length) % all.length]?.focus();
		} else if (event.key === "Home" || event.key === "End") {
			event.preventDefault();
			(event.key === "Home" ? all[0] : all.at(-1))?.focus();
		} else if (event.key === "Tab") {
			close(false);
		}
	};

	const label = username ? `@${username}` : name;
	return (
		<div className="relative">
			<button
				ref={buttonRef}
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? menuId : undefined}
				aria-label={`Account menu for ${label}`}
				className="flex rounded-full outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
				onClick={() => setOpen((value) => !value)}
				onKeyDown={(event) => {
					if (event.key === "ArrowDown" && !open) {
						event.preventDefault();
						setOpen(true);
					}
				}}
			>
				<Avatar name={username ?? name} image={image} size="sm" />
			</button>
			{open ? (
				<div
					ref={menuRef}
					id={menuId}
					role="menu"
					aria-label={label}
					tabIndex={-1}
					onKeyDown={onMenuKeyDown}
					className="absolute right-0 z-50 mt-2 w-56 origin-top-right animate-in fade-in-0 zoom-in-95 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg duration-150 motion-reduce:animate-none"
				>
					<p className="truncate px-2.5 pt-1.5 pb-2 text-sm text-muted-foreground">
						Signed in as <span className="font-medium text-foreground">{label}</span>
					</p>
					<Link
						to="/settings"
						role="menuitem"
						tabIndex={-1}
						className="flex h-9 items-center gap-2 rounded-md px-2.5 text-sm text-foreground no-underline outline-hidden hover:bg-accent focus:bg-accent"
						onClick={() => close(false)}
					>
						<Settings className="size-4 text-muted-foreground" aria-hidden="true" />
						Settings
					</Link>
					<button
						type="button"
						role="menuitem"
						tabIndex={-1}
						className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm text-foreground outline-hidden hover:bg-accent focus:bg-accent"
						onClick={async () => {
							close(true);
							await authClient.signOut();
							await navigate({ to: "/" });
							await router.invalidate();
						}}
					>
						<LogOut className="size-4 text-muted-foreground" aria-hidden="true" />
						Sign out
					</button>
				</div>
			) : null}
		</div>
	);
}

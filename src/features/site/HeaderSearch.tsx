import { useNavigate, useRouterState } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// The header's search field. A plain GET form to /search, so it works before hydration;
// once hydrated it navigates client-side. "/" focuses it from anywhere, like GitHub and npm.
export function HeaderSearch({ className = "" }: { className?: string }) {
	const navigate = useNavigate();
	const current = useRouterState({
		select: (s) => (s.location.pathname === "/search" ? String(s.location.search.q ?? "") : ""),
	});
	const [value, setValue] = useState(current);
	const input = useRef<HTMLInputElement>(null);

	useEffect(() => setValue(current), [current]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target as HTMLElement | null;
			if (target?.closest("input, textarea, select, [contenteditable]")) return;
			event.preventDefault();
			input.current?.focus();
			input.current?.select();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	return (
		<search className={className}>
			<form
				action="/search"
				method="get"
				className="relative"
				onSubmit={(event) => {
					event.preventDefault();
					const q = value.trim();
					navigate({ to: "/search", search: q ? { q } : {} });
				}}
			>
				<SearchIcon
					className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
					strokeWidth={1.75}
					aria-hidden="true"
				/>
				<input
					ref={input}
					type="search"
					name="q"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					placeholder="Search packages"
					aria-label="Search packages"
					autoComplete="off"
					autoCapitalize="off"
					spellCheck={false}
					enterKeyHint="search"
					className="peer h-11 w-full rounded-md border border-input bg-card pr-9 pl-9 text-base placeholder:text-muted-foreground sm:h-9 sm:text-sm"
				/>
				{!value && (
					<span
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border px-1.5 font-mono text-xs leading-5 text-muted-foreground peer-focus:hidden sm:block"
					>
						/
					</span>
				)}
			</form>
		</search>
	);
}

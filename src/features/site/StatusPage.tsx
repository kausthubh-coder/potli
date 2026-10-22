import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PotliMark } from "./PotliMark";

// The page for "nothing here" and "something broke": the bundle mark, what happened, what to do.
export function StatusPage({
	code,
	title,
	children,
	actions,
}: {
	code: string;
	title: ReactNode;
	children?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-start px-4 py-20 sm:px-6 sm:py-28">
			<PotliMark className="size-14 text-muted-foreground" />
			<p className="mt-6 font-mono text-sm text-muted-foreground">{code}</p>
			<h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight break-words sm:text-4xl">
				{title}
			</h1>
			{children && <div className="mt-4 max-w-xl text-lg text-muted-foreground">{children}</div>}
			<div className="mt-8 flex flex-wrap gap-3">
				{actions ?? (
					<Link to="/" className={buttonClass("primary")}>
						Go to the home page
					</Link>
				)}
			</div>
		</main>
	);
}

export function buttonClass(kind: "primary" | "secondary") {
	const base =
		"inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-transform duration-100 ease-out active:scale-[0.97]";
	return kind === "primary"
		? `${base} bg-primary text-primary-foreground hover:bg-primary-hover`
		: `${base} border border-input bg-card hover:bg-accent`;
}

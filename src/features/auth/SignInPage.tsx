import { useNavigate, useRouter } from "@tanstack/react-router";
import { Github } from "lucide-react";
import { useId, useRef, useState } from "react";

import { fieldError, fieldHint, primaryButton, secondaryButton, textInput } from "#/lib/form-styles";
import { authClient } from "./auth-client";
import { SIGNUP_CLOSED } from "./signup.logic";
import { startGitHubSignIn } from "./UserMenu";

type Props = {
	github: boolean;
	devSignIn: boolean;
	error: string | undefined;
};

function errorCopy(code: string): { title: string; body: string } {
	if (code === SIGNUP_CLOSED) {
		return {
			title: "Sign-up is closed for now",
			body: "potli is open to a short list of GitHub accounts while it gets ready, and yours isn't on it yet. No account was created.",
		};
	}
	if (code === "github_unavailable") {
		return {
			title: "GitHub sign-in isn't available",
			body: "This server has no GitHub OAuth app set up yet, so it can't send you to GitHub.",
		};
	}
	return { title: "Sign-in didn't finish", body: `GitHub sent back “${code}”. Try signing in again.` };
}

export function SignInPage({ github, devSignIn, error }: Props) {
	const [pending, setPending] = useState(false);
	const [githubError, setGithubError] = useState<string | null>(null);
	const shownError = githubError ?? error;
	const copy = shownError ? errorCopy(shownError) : null;

	return (
		<main className="mx-auto w-full max-w-sm px-4 pt-16 pb-24 sm:pt-24">
			<h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">Sign in to potli</h1>
			<p className="mt-2 text-pretty text-muted-foreground">
				Use your GitHub account. You get the scope that matches your GitHub login, so you can publish{" "}
				<code>@your-login/package</code> right away.
			</p>

			{copy ? (
				<div role="alert" className="mt-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm">
					<p className="font-medium text-destructive">{copy.title}</p>
					<p className="mt-1 text-pretty text-foreground/80">{copy.body}</p>
				</div>
			) : null}

			<button
				type="button"
				className={`${primaryButton} mt-6 w-full`}
				disabled={!github || pending}
				onClick={async () => {
					setPending(true);
					const { error: signInError } = await startGitHubSignIn("/settings");
					if (signInError) {
						setPending(false);
						setGithubError("github_unavailable");
					}
				}}
			>
				<Github className="size-4" aria-hidden="true" />
				{pending ? "Opening GitHub…" : "Sign in with GitHub"}
			</button>
			{github ? null : <p className={`${fieldHint} mt-2`}>GitHub sign-in isn't set up on this server yet.</p>}

			{devSignIn ? <DevSignInForm /> : null}
		</main>
	);
}

// Rendered only when the server has dev sign-in on (localhost, DEV_LOGIN=1, `vite dev`).
function DevSignInForm() {
	const navigate = useNavigate();
	const router = useRouter();
	const inputRef = useRef<HTMLInputElement>(null);
	const id = useId();
	const [login, setLogin] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	return (
		<section aria-labelledby={`${id}-title`} className="mt-12 border-t border-border pt-8">
			<h2 id={`${id}-title`} className="text-sm font-semibold text-foreground">
				Dev sign-in
			</h2>
			<p className={`${fieldHint} mt-1 text-pretty`}>
				Local only. Signs in as any GitHub login without asking GitHub. New accounts still need to be on{" "}
				<code>SIGNUP_ALLOWLIST</code>.
			</p>
			<form
				className="mt-4"
				noValidate
				onSubmit={async (event) => {
					event.preventDefault();
					if (login.trim() === "") {
						setError("Enter a GitHub login");
						inputRef.current?.focus();
						return;
					}
					setPending(true);
					setError(null);
					const res = await fetch("/api/auth/dev/sign-in", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ login }),
					});
					if (!res.ok) {
						const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
						setPending(false);
						setError(
							body.code === SIGNUP_CLOSED
								? `@${login.trim().toLowerCase()} isn't on SIGNUP_ALLOWLIST, so no account was created.`
								: (body.message ?? `Dev sign-in failed (${res.status}).`),
						);
						inputRef.current?.focus();
						return;
					}
					// The header reads the session from Better Auth's client store; tell it the session changed.
					authClient.$store.notify("$sessionSignal");
					await router.invalidate();
					await navigate({ to: "/settings" });
				}}
			>
				<label htmlFor={`${id}-login`} className="text-sm font-medium text-foreground">
					GitHub login
				</label>
				<div className="mt-1.5 flex gap-2">
					<input
						ref={inputRef}
						id={`${id}-login`}
						name="login"
						className={textInput}
						value={login}
						onChange={(event) => {
							setLogin(event.target.value);
							if (error) setError(null);
						}}
						autoComplete="username"
						autoCapitalize="none"
						spellCheck={false}
						placeholder="alice"
						aria-invalid={error ? true : undefined}
						aria-describedby={error ? `${id}-error` : undefined}
					/>
					<button type="submit" className={secondaryButton} disabled={pending}>
						{pending ? "Signing in…" : "Sign in"}
					</button>
				</div>
				{error ? (
					<p id={`${id}-error`} className={`${fieldError} mt-1.5`}>
						{error}
					</p>
				) : null}
			</form>
		</section>
	);
}

import { useRouter } from "@tanstack/react-router";
import { useId, useRef, useState } from "react";
import { fieldError, fieldHint, primaryButton, textInput } from "#/lib/form-styles";
import { formatDate } from "#/lib/format-date";
import { claimScope } from "./scopes.functions";
import { checkScopeName, type OwnedScope, type UserScopeStatus } from "./scopes.logic";

function missingUserScopeCopy(status: Extract<UserScopeStatus, { status: "missing" }>): string {
	if (status.reason === "reserved") {
		return `@${status.name} is reserved, so your account has no user scope. Claim an org scope to publish.`;
	}
	if (status.reason === "taken") {
		return `@${status.name} was claimed as an org scope before you joined, so your account has no user scope. Claim another name to publish.`;
	}
	return "Your account has no user scope. Claim an org scope to publish.";
}

export function ScopesSection({ scopes, userScope }: { scopes: OwnedScope[]; userScope: UserScopeStatus }) {
	const id = useId();
	return (
		<section aria-labelledby={`${id}-title`}>
			<h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight text-foreground">
				Scopes
			</h2>
			<p className="mt-1 text-pretty text-muted-foreground">
				Every package lives in a scope, like <code>@{userScope.name || "acme"}/utils</code>. You can publish
				to any scope you own.
			</p>

			{userScope.status === "missing" ? (
				<p className="mt-4 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-pretty text-foreground">
					{missingUserScopeCopy(userScope)}
				</p>
			) : null}

			{scopes.length > 0 ? (
				<ul className="mt-4 divide-y divide-border">
					{scopes.map((scope) => (
						<li key={scope.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
							<span className="font-mono text-[15px] font-medium break-all text-foreground">
								@{scope.name}
							</span>
							<span className="text-sm text-muted-foreground">
								{scope.kind === "user" ? "User scope" : "Org scope"} · since{" "}
								<time dateTime={new Date(scope.createdAt).toISOString()}>{formatDate(scope.createdAt)}</time>
							</span>
						</li>
					))}
				</ul>
			) : (
				<p className={`${fieldHint} mt-4`}>You don't own a scope yet. Claim one below to publish packages.</p>
			)}

			<ClaimScopeForm />
		</section>
	);
}

function ClaimScopeForm() {
	const router = useRouter();
	const id = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [claimed, setClaimed] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const localError = (input: string) => {
		const checked = checkScopeName(input);
		return checked.ok ? null : checked.message;
	};

	return (
		<form
			className="mt-6"
			noValidate
			onSubmit={async (event) => {
				event.preventDefault();
				setClaimed(null);
				const problem = localError(value);
				if (problem) {
					setError(problem);
					inputRef.current?.focus();
					return;
				}
				setPending(true);
				try {
					const result = await claimScope({ data: { name: value } });
					if (!result.ok) {
						setError(result.message);
						inputRef.current?.focus();
						return;
					}
					setValue("");
					setError(null);
					await router.invalidate();
					setClaimed(result.name);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : "Couldn't claim the scope. Try again.");
				} finally {
					setPending(false);
				}
			}}
		>
			<label htmlFor={`${id}-name`} className="text-sm font-medium text-foreground">
				Claim an org scope
			</label>
			<div className="mt-1.5 flex flex-wrap gap-2 sm:flex-nowrap">
				<div className="relative min-w-0 flex-1">
					<span
						aria-hidden="true"
						className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-muted-foreground"
					>
						@
					</span>
					<input
						ref={inputRef}
						id={`${id}-name`}
						name="scope"
						className={`${textInput} pl-7 font-mono`}
						value={value}
						onChange={(event) => {
							setValue(event.target.value);
							setClaimed(null);
							// Once an error shows, recheck on every keystroke so it clears as soon as it's fixed.
							if (error) setError(localError(event.target.value));
						}}
						onBlur={() => {
							if (value.trim() !== "") setError(localError(value));
						}}
						autoComplete="off"
						autoCapitalize="none"
						spellCheck={false}
						placeholder="acme"
						maxLength={215}
						aria-invalid={error ? true : undefined}
						aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
					/>
				</div>
				<button type="submit" className={primaryButton} disabled={pending}>
					{pending ? "Claiming…" : "Claim scope"}
				</button>
			</div>
			<p id={`${id}-hint`} className={`${fieldHint} mt-1.5`}>
				Lowercase letters, digits, “-”, “.” and “_”. Names like @react and @npm are reserved.
			</p>
			{error ? (
				<p id={`${id}-error`} className={`${fieldError} mt-1`}>
					{error}
				</p>
			) : null}
			<p aria-live="polite" className="mt-1 text-sm text-foreground">
				{claimed ? `@${claimed} is yours.` : ""}
			</p>
		</form>
	);
}

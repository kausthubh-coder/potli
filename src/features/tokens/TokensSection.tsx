import { useRouter } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
	dangerButton,
	fieldError,
	fieldHint,
	primaryButton,
	quietDangerButton,
	secondaryButton,
	textInput,
} from "#/lib/form-styles";
import { formatDate } from "#/lib/format-date";
import { checkTokenName, type TokenSummary } from "./tokens.data";
import { createPublishToken, revokePublishToken } from "./tokens.functions";

export function TokensSection({ tokens, scopeNames }: { tokens: TokenSummary[]; scopeNames: string[] }) {
	const id = useId();
	const headingRef = useRef<HTMLHeadingElement>(null);
	const [created, setCreated] = useState<{ name: string; token: string } | null>(null);

	return (
		<section aria-labelledby={`${id}-title`}>
			<h2
				id={`${id}-title`}
				ref={headingRef}
				tabIndex={-1}
				className="text-lg font-semibold tracking-tight text-foreground outline-hidden"
			>
				Publish tokens
			</h2>
			<p className="mt-1 text-pretty text-muted-foreground">
				npm uses a token to publish to your scopes. You see each token once, when you create it.
			</p>

			<CreateTokenForm onCreated={setCreated} />
			{created ? (
				<NewToken
					key={created.token}
					name={created.name}
					token={created.token}
					scopeNames={scopeNames}
					onDone={() => {
						setCreated(null);
						headingRef.current?.focus();
					}}
				/>
			) : null}

			<TokenList tokens={tokens} onRevoked={() => headingRef.current?.focus()} />
		</section>
	);
}

function CreateTokenForm({ onCreated }: { onCreated: (created: { name: string; token: string }) => void }) {
	const router = useRouter();
	const id = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	return (
		<form
			className="mt-6"
			noValidate
			onSubmit={async (event) => {
				event.preventDefault();
				const checked = checkTokenName(value);
				if (!checked.ok) {
					setError(checked.message);
					inputRef.current?.focus();
					return;
				}
				setPending(true);
				try {
					const result = await createPublishToken({ data: { name: value } });
					if (!result.ok) {
						setError(result.message);
						inputRef.current?.focus();
						return;
					}
					setValue("");
					setError(null);
					// Show the token with the refreshed list, and show it even if the refresh fails:
					// this is the only time it exists outside the user's clipboard.
					try {
						await router.invalidate();
					} finally {
						onCreated({ name: result.summary.name, token: result.token });
					}
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : "Couldn't create the token. Try again.");
				} finally {
					setPending(false);
				}
			}}
		>
			<label htmlFor={`${id}-name`} className="text-sm font-medium text-foreground">
				Token name
			</label>
			<div className="mt-1.5 flex flex-wrap gap-2 sm:flex-nowrap">
				<input
					ref={inputRef}
					id={`${id}-name`}
					name="token-name"
					className={`${textInput} flex-1`}
					value={value}
					onChange={(event) => {
						setValue(event.target.value);
						if (error) {
							const checked = checkTokenName(event.target.value);
							setError(checked.ok ? null : checked.message);
						}
					}}
					autoComplete="off"
					placeholder="laptop"
					maxLength={65}
					aria-invalid={error ? true : undefined}
					aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
				/>
				<button type="submit" className={primaryButton} disabled={pending}>
					{pending ? "Creating…" : "Create token"}
				</button>
			</div>
			<p id={`${id}-hint`} className={`${fieldHint} mt-1.5`}>
				Name it after where it will live, like laptop or GitHub Actions.
			</p>
			{error ? (
				<p id={`${id}-error`} className={`${fieldError} mt-1`}>
					{error}
				</p>
			) : null}
		</form>
	);
}

function NewToken({
	name,
	token,
	scopeNames,
	onDone,
}: {
	name: string;
	token: string;
	scopeNames: string[];
	onDone: () => void;
}) {
	const id = useId();
	const panelRef = useRef<HTMLElement>(null);
	// Rendered only after a click, so the browser's location is the registry origin npm should use.
	const { origin, host } = window.location;
	const npmrc = [
		...(scopeNames.length > 0 ? scopeNames : ["your-scope"]).map((scope) => `@${scope}:registry=${origin}/`),
		`//${host}/:_authToken=${token}`,
	].join("\n");

	useEffect(() => {
		panelRef.current?.focus();
	}, []);

	return (
		<section
			ref={panelRef}
			tabIndex={-1}
			aria-labelledby={`${id}-title`}
			className="mt-6 rounded-lg bg-muted/60 p-4 outline-hidden sm:p-5"
		>
			<h3 id={`${id}-title`} className="font-semibold text-foreground">
				Copy “{name}” now
			</h3>
			<p className="mt-1 text-sm text-pretty text-muted-foreground">
				This is the only time you'll see this token. potli stores only its hash.
			</p>

			<div className="mt-4 flex items-start gap-2">
				<div className="min-w-0 flex-1 rounded-md bg-background px-3 py-2.5 font-mono text-sm break-all text-foreground">
					{token}
				</div>
				<CopyButton text={token} label="Copy token" />
			</div>

			<p className="mt-5 text-sm text-foreground">
				Add these lines to <code>.npmrc</code> in your project or home folder:
			</p>
			<div className="mt-2 flex items-start gap-2">
				<pre className="min-w-0 flex-1 overflow-x-auto rounded-md bg-background px-3 py-2.5 font-mono text-sm text-foreground">
					{npmrc}
				</pre>
				<CopyButton text={npmrc} label="Copy .npmrc lines" />
			</div>
			{scopeNames.length === 0 ? (
				<p className={`${fieldHint} mt-2`}>Replace your-scope with a scope you own, once you claim one.</p>
			) : null}

			<button type="button" className={`${secondaryButton} mt-5`} onClick={onDone}>
				I've copied it
			</button>
		</section>
	);
}

function CopyButton({ text, label }: { text: string; label: string }) {
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 2000);
		return () => clearTimeout(timer);
	}, [copied]);
	return (
		<button
			type="button"
			className={`${secondaryButton} w-28`}
			onClick={async () => {
				await navigator.clipboard.writeText(text);
				setCopied(true);
			}}
			aria-label={copied ? "Copied" : label}
		>
			{copied ? (
				<Check className="size-4" aria-hidden="true" />
			) : (
				<Copy className="size-4" aria-hidden="true" />
			)}
			<span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
		</button>
	);
}

function TokenList({ tokens, onRevoked }: { tokens: TokenSummary[]; onRevoked: () => void }) {
	const router = useRouter();
	const id = useId();
	const dialogRef = useRef<HTMLDialogElement>(null);
	const cancelRef = useRef<HTMLButtonElement>(null);
	const openerRef = useRef<HTMLElement | null>(null);
	const revokedRef = useRef(false);
	const [target, setTarget] = useState<TokenSummary | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const open = (token: TokenSummary, opener: HTMLElement) => {
		openerRef.current = opener;
		setTarget(token);
		setError(null);
		dialogRef.current?.showModal();
		// Focus starts on Cancel, so a stray Enter doesn't revoke anything.
		cancelRef.current?.focus();
	};

	return (
		<>
			{tokens.length === 0 ? (
				<p className={`${fieldHint} mt-6`}>No tokens yet. Create one above to publish from npm.</p>
			) : null}
			{/* The dialog below stays mounted when the last token goes, so it can close and hand focus back. */}
			<ul className="mt-6 divide-y divide-border border-y border-border empty:hidden">
				{tokens.map((token) => (
					<li key={token.id} className="flex items-center gap-4 py-3">
						<div className="min-w-0 flex-1">
							<p className="truncate font-medium text-foreground">{token.name}</p>
							<p className="text-sm text-muted-foreground">
								Created{" "}
								<time dateTime={new Date(token.createdAt).toISOString()}>{formatDate(token.createdAt)}</time>
								{" · "}
								{token.lastUsedAt ? (
									<>
										Last used{" "}
										<time dateTime={new Date(token.lastUsedAt).toISOString()}>
											{formatDate(token.lastUsedAt)}
										</time>
									</>
								) : (
									"Never used"
								)}
							</p>
						</div>
						<button
							type="button"
							className={quietDangerButton}
							aria-label={`Revoke ${token.name}`}
							onClick={(event) => open(token, event.currentTarget)}
						>
							Revoke…
						</button>
					</li>
				))}
			</ul>

			<dialog
				ref={dialogRef}
				aria-labelledby={`${id}-title`}
				aria-describedby={`${id}-body`}
				className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl bg-popover p-5 text-popover-foreground shadow-xl backdrop:bg-black/30"
				onClose={() => {
					setTarget(null);
					// Cancel: back to the button that opened it. Revoked: that row is going away, so focus
					// the section instead of letting it fall to the page.
					if (revokedRef.current) onRevoked();
					else openerRef.current?.focus();
					revokedRef.current = false;
				}}
			>
				<h2 id={`${id}-title`} className="font-semibold text-foreground text-balance">
					Revoke “{target?.name}”?
				</h2>
				<p id={`${id}-body`} className="mt-1.5 text-sm text-pretty text-muted-foreground">
					npm clients using this token won't be able to publish anymore. This can't be undone.
				</p>
				{error ? <p className={`${fieldError} mt-3`}>{error}</p> : null}
				<div className="mt-5 flex justify-end gap-2">
					<button
						ref={cancelRef}
						type="button"
						className={secondaryButton}
						onClick={() => dialogRef.current?.close()}
					>
						Cancel
					</button>
					<button
						type="button"
						className={dangerButton}
						disabled={pending}
						onClick={async () => {
							if (!target) return;
							setPending(true);
							try {
								const result = await revokePublishToken({ data: { id: target.id } });
								if (!result.ok) {
									setError(result.message);
									return;
								}
								revokedRef.current = true;
								await router.invalidate();
								dialogRef.current?.close();
							} catch (cause) {
								setError(cause instanceof Error ? cause.message : "Couldn't revoke the token. Try again.");
							} finally {
								setPending(false);
							}
						}}
					>
						{pending ? "Revoking…" : "Revoke token"}
					</button>
				</div>
			</dialog>
		</>
	);
}

// The Report action at the bottom of a package page. Anyone can send one, signed in or not; it goes
// to potli's admins (/admin).
import { Link } from "@tanstack/react-router";
import { FlagIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { fieldError, fieldHint, primaryButton, secondaryButton, textInput } from "#/lib/form-styles";
import { submitReport } from "./moderation.functions";
import {
	checkReport,
	MAX_REPORT_DETAILS,
	REPORT_REASON_LABELS,
	REPORT_REASONS,
	type ReportReason,
} from "./moderation.logic";

type Stage = "closed" | "open" | "sent";

export function ReportForm({ packageName, versions }: { packageName: string; versions: string[] }) {
	const id = useId();
	const [stage, setStage] = useState<Stage>("closed");
	const [reason, setReason] = useState<ReportReason | "">("");
	const [version, setVersion] = useState("");
	const [details, setDetails] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const formRef = useRef<HTMLFormElement>(null);
	const sentRef = useRef<HTMLOutputElement>(null);
	const openRef = useRef<HTMLButtonElement>(null);

	// Focus follows the form: into it when it opens, onto the thank-you when it's sent.
	useEffect(() => {
		if (stage === "open") formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
		if (stage === "sent") sentRef.current?.focus();
	}, [stage]);

	if (stage === "sent") {
		return (
			<output ref={sentRef} tabIndex={-1} className="block text-muted-foreground outline-hidden">
				Thanks. Your report went to potli's admin.
			</output>
		);
	}

	if (stage === "closed") {
		return (
			<button
				ref={openRef}
				type="button"
				className="-mx-2 inline-flex h-9 items-center gap-2 rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground"
				onClick={() => setStage("open")}
			>
				<FlagIcon className="size-4" strokeWidth={1.75} aria-hidden="true" />
				Report this package
			</button>
		);
	}

	return (
		<form
			ref={formRef}
			aria-labelledby={`${id}-title`}
			className="rounded-xl border bg-card p-5"
			noValidate
			onSubmit={async (event) => {
				event.preventDefault();
				const input = { packageName, version: version || null, reason, details };
				const checked = checkReport(input);
				if (!checked.ok) {
					setError(checked.message);
					return;
				}
				setPending(true);
				setError(null);
				try {
					const result = await submitReport({ data: input });
					if (result.ok) setStage("sent");
					else setError(result.message);
				} catch {
					setError("Couldn't send the report. Try again.");
				} finally {
					setPending(false);
				}
			}}
		>
			<h2 id={`${id}-title`} className="font-medium">
				Report {packageName}
			</h2>
			<p className={`${fieldHint} mt-1 text-pretty`}>
				For packages that break potli's{" "}
				<Link to="/terms" className="text-foreground underline underline-offset-4 hover:text-primary">
					terms
				</Link>
				. You don't need to sign in.
			</p>

			<fieldset className="mt-4">
				<legend className="text-sm font-medium">What's wrong?</legend>
				<div className="mt-1.5 space-y-0.5">
					{REPORT_REASONS.map((value) => (
						<label key={value} className="flex min-h-9 items-center gap-2.5 text-sm">
							<input
								type="radio"
								name={`${id}-reason`}
								value={value}
								checked={reason === value}
								onChange={() => {
									setReason(value);
									setError(null);
								}}
								className="size-4 accent-primary"
							/>
							{REPORT_REASON_LABELS[value]}
						</label>
					))}
				</div>
			</fieldset>

			<label htmlFor={`${id}-version`} className="mt-4 block text-sm font-medium">
				Version
			</label>
			<select
				id={`${id}-version`}
				className={`${textInput} mt-1.5`}
				value={version}
				onChange={(event) => setVersion(event.target.value)}
			>
				<option value="">All versions</option>
				{versions.map((v) => (
					<option key={v} value={v}>
						{v}
					</option>
				))}
			</select>

			<label htmlFor={`${id}-details`} className="mt-4 block text-sm font-medium">
				Details
			</label>
			<textarea
				id={`${id}-details`}
				className={`${textInput} mt-1.5 h-28 py-2`}
				value={details}
				maxLength={MAX_REPORT_DETAILS}
				onChange={(event) => {
					setDetails(event.target.value);
					if (error) setError(null);
				}}
				aria-describedby={`${id}-details-hint`}
			/>
			<p id={`${id}-details-hint`} className={`${fieldHint} mt-1.5`}>
				Which file or behavior, and how you found it. Required for "Something else".
			</p>

			{error ? (
				<p role="alert" className={`${fieldError} mt-3`}>
					{error}
				</p>
			) : null}

			<div className="mt-4 flex gap-2">
				<button type="submit" className={primaryButton} disabled={pending}>
					{pending ? "Sending…" : "Send report"}
				</button>
				<button
					type="button"
					className={secondaryButton}
					onClick={() => {
						setStage("closed");
						setError(null);
						requestAnimationFrame(() => openRef.current?.focus());
					}}
				>
					Cancel
				</button>
			</div>
		</form>
	);
}

import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Copies `text` and shows a check for a moment. The label stays the same width so nothing
// next to it moves, and a live region tells screen readers it worked.
export function CopyButton({ text, label }: { text: string; label: string }) {
	const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

	useEffect(() => () => clearTimeout(timer.current), []);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setState("copied");
		} catch {
			setState("failed");
		}
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setState("idle"), 1600);
	};

	return (
		<button
			type="button"
			onClick={copy}
			aria-label={label}
			title={label}
			data-state={state}
			className="relative grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-transform duration-100 ease-out after:absolute after:-inset-1.5 hover:bg-accent hover:text-foreground active:scale-[0.94] data-[state=copied]:text-success"
		>
			{state === "copied" ? (
				<CheckIcon className="size-4" strokeWidth={2} aria-hidden="true" />
			) : (
				<CopyIcon className="size-4" strokeWidth={1.75} aria-hidden="true" />
			)}
			<span className="sr-only" aria-live="polite">
				{state === "copied"
					? "Copied"
					: state === "failed"
						? "Copy failed. Select the text and copy it."
						: ""}
			</span>
		</button>
	);
}

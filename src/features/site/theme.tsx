import { MoonIcon, SunIcon } from "lucide-react";

const STORAGE_KEY = "potli-theme";

// Runs in <head> before the first paint, so a dark-mode visitor never sees a light flash.
// A saved choice wins; otherwise the page follows the system setting, live.
export const themeScript = `(() => {
	const root = document.documentElement;
	const media = window.matchMedia("(prefers-color-scheme: dark)");
	const apply = () => {
		let saved = null;
		try { saved = localStorage.getItem("${STORAGE_KEY}"); } catch {}
		root.classList.toggle("dark", saved ? saved === "dark" : media.matches);
	};
	apply();
	media.addEventListener("change", apply);
})();`;

export function ThemeToggle() {
	const toggle = () => {
		const dark = !document.documentElement.classList.contains("dark");
		document.documentElement.classList.toggle("dark", dark);
		try {
			localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
		} catch {
			// Private mode: the choice lasts for this page only.
		}
	};
	// Both icons render on the server; CSS shows the right one, so hydration never mismatches.
	return (
		<button
			type="button"
			onClick={toggle}
			aria-label="Switch between light and dark mode"
			title="Switch between light and dark mode"
			className="grid size-11 shrink-0 sm:size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
		>
			<MoonIcon className="size-[18px] dark:hidden" strokeWidth={1.75} />
			<SunIcon className="hidden size-[18px] dark:block" strokeWidth={1.75} />
		</button>
	);
}

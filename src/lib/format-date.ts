// UTC on purpose: the server renders the page and the browser hydrates it, and both must print
// the same day or React reports a mismatch.
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function formatDate(ms: number): string {
	return dateFormat.format(ms);
}

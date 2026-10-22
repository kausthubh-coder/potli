import { useState } from "react";

import { formatCount } from "./packages.logic";

const DAY = 24 * 60 * 60 * 1000;
const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function weekRange(now: Date, weeksAgo: number): string {
	const end = new Date(now.getTime() - weeksAgo * 7 * DAY);
	const start = new Date(end.getTime() - 6 * DAY);
	return `${short.format(start)} – ${short.format(end)}`;
}

/** A bar rounded only at its data end, square where it meets the baseline. */
function topRoundedBar(x: number, y: number, w: number, h: number, r: number): string {
	return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// Weekly downloads as a stat tile: the number leads, a 12-week bar trend sits under it in a
// quiet tone with the current week in the accent. Hovering a bar names its week and count.
export function DownloadsTile({ weekly, now }: { weekly: number[]; now: Date }) {
	const [hover, setHover] = useState<number | null>(null);
	const current = weekly[weekly.length - 1] ?? 0;
	const max = Math.max(1, ...weekly);
	const height = 36;
	const gap = 2;
	const barWidth = 10;
	const width = weekly.length * barWidth + (weekly.length - 1) * gap;
	const caption =
		hover === null
			? "Past 7 days"
			: `${weekRange(now, weekly.length - 1 - hover)}: ${formatCount(weekly[hover])}`;

	return (
		<div>
			<div className="text-sm text-muted-foreground">Weekly downloads</div>
			<div className="mt-1 flex items-end justify-between gap-4">
				<div className="text-2xl font-semibold tracking-tight tabular-nums">{formatCount(current)}</div>
				<svg
					viewBox={`0 0 ${width} ${height}`}
					width={width}
					height={height}
					className="shrink-0 overflow-visible"
					role="img"
					aria-label={`Downloads per week for the past ${weekly.length} weeks, from ${formatCount(weekly[0] ?? 0)} to ${formatCount(current)}`}
					onMouseLeave={() => setHover(null)}
				>
					{weekly.map((count, i) => {
						const h = Math.max(2, Math.round((count / max) * height));
						const isCurrent = i === weekly.length - 1;
						const x = i * (barWidth + gap);
						return (
							// Each hit area is the full column, taller than its bar.
							// biome-ignore lint/a11y/noStaticElementInteractions: hover only adds detail; the label above has the data
							<g key={x} onMouseEnter={() => setHover(i)}>
								<rect x={x - gap / 2} y={0} width={barWidth + gap} height={height} fill="transparent" />
								<path
									d={topRoundedBar(x, height - h, barWidth, h, Math.min(2, h / 2))}
									className={
										hover === i ? "fill-foreground" : isCurrent ? "fill-primary" : "fill-border-strong"
									}
								/>
							</g>
						);
					})}
				</svg>
			</div>
			<div className="mt-1 text-xs text-muted-foreground tabular-nums" aria-live="polite">
				{caption}
			</div>
		</div>
	);
}

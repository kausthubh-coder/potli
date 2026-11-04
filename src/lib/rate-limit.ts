// Rate limits for the write paths people could abuse now that anyone can sign up. Counters live
// in D1 (rate_limits), next to the Worker, so a limit holds across every isolate and colo.
// Installs, packuments and tarball downloads are never limited.
import { env, waitUntil } from "cloudflare:workers";
import { Buffer } from "node:buffer";
import { lt, sql } from "drizzle-orm";

import { db } from "#/db";
import { rateLimits } from "#/db/schema";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Generous for a person, tight for a script. Fixed windows: up to twice `max` can land across
// a window boundary, which is fine for slowing abuse down.
export const RATE_LIMITS = {
	// Per user. A monorepo release publishes many packages at once.
	publish: { max: 60, windowSeconds: HOUR },
	"create-token": { max: 10, windowSeconds: HOUR },
	"claim-scope": { max: 20, windowSeconds: DAY },
	// Per IP address. Sign-in counts the GitHub redirect and its callback, so one sign-in is two.
	"sign-in": { max: 30, windowSeconds: 10 * MINUTE },
	"sign-up": { max: 10, windowSeconds: HOUR },
	report: { max: 10, windowSeconds: HOUR },
} as const;

export type RateLimitedAction = keyof typeof RATE_LIMITS;

export type RateLimitHit = { max: number; retryAfterSeconds: number };

// Counts one attempt at `action` by `subject` and returns null when it's allowed, or how long
// until the window resets when it's over the limit. Every attempt counts, allowed or not.
export async function rateLimit(
	action: RateLimitedAction,
	subject: string,
	now = Date.now(),
): Promise<RateLimitHit | null> {
	const { max, windowSeconds } = RATE_LIMITS[action];
	const windowMs = windowSeconds * 1000;
	const windowStart = Math.floor(now / windowMs) * windowMs;
	const [row] = await db
		.insert(rateLimits)
		.values({ key: `${action}:${subject}`, windowStart, count: 1 })
		.onConflictDoUpdate({
			target: rateLimits.key,
			// A row from an earlier window starts over at 1.
			set: {
				count: sql`case when ${rateLimits.windowStart} = excluded.window_start then ${rateLimits.count} + 1 else 1 end`,
				windowStart: sql`excluded.window_start`,
			},
		})
		.returning({ count: rateLimits.count });
	waitUntil(
		db
			.delete(rateLimits)
			.where(lt(rateLimits.windowStart, now - DAY * 1000))
			.run(),
	);
	if ((row?.count ?? 0) <= max) return null;
	return { max, retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)) };
}

export function userSubject(userId: string): string {
	return `user:${userId}`;
}

// The client's IP address, hashed with the auth secret so D1 never holds an address and the hash
// can't be reversed by hashing every IPv4 address. Cloudflare sets CF-Connecting-IP on every
// request that reaches the Worker.
export async function ipSubject(headers: Headers): Promise<string> {
	const ip = headers.get("cf-connecting-ip") ?? "unknown";
	const salted = new TextEncoder().encode(`${env.BETTER_AUTH_SECRET}:${ip}`);
	const digest = await crypto.subtle.digest("SHA-256", salted);
	return `ip:${Buffer.from(digest).toString("hex").slice(0, 32)}`;
}

// "in 12 minutes", for the messages that say when to try again.
export function tryAgainIn(seconds: number): string {
	if (seconds < 90) return `in ${seconds} second${seconds === 1 ? "" : "s"}`;
	const minutes = Math.ceil(seconds / MINUTE);
	if (minutes < 90) return `in ${minutes} minutes`;
	return `in ${Math.ceil(seconds / HOUR)} hours`;
}
